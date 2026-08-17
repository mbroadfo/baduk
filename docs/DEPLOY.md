# Deploying to S3

The SPA is a pure static build — no server, no API, no per-move cost. Bots run in the visitor's
browser, so hosting is a bucket and a CDN.

## One-time AWS setup

### 1. Bucket

```bash
BUCKET=baduk-playspace          # must be globally unique
REGION=us-east-1

aws s3 mb "s3://$BUCKET" --region "$REGION"
```

Keep **Block Public Access on**. CloudFront reaches the bucket through Origin Access Control, so
the bucket itself never needs to be public — a public bucket is the most common way static sites
turn into someone else's file host.

### 2. CloudFront

Create a distribution with:

- **Origin**: the S3 bucket, using **Origin Access Control** (not the legacy OAI, and not the
  website endpoint).
- **Viewer protocol policy**: Redirect HTTP to HTTPS.
- **Default root object**: `index.html`.
- **Custom error responses**: map both **403** and **404** to `/index.html` with response code
  **200**. This is what makes a single-page app survive a refresh on any path.

CloudFront will print a bucket policy to paste into S3 when you attach the OAC.

### 3. Deploy role for GitHub Actions

Use OIDC so no long-lived AWS keys ever sit in GitHub secrets. Create an IAM role trusted by
`token.actions.githubusercontent.com`, restricted to this repo:

```json
{
  "Effect": "Allow",
  "Principal": { "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com" },
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": {
    "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
    "StringLike": { "token.actions.githubusercontent.com:sub": "repo:mbroadfo/baduk:*" }
  }
}
```

Grant it only `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket` on the bucket, and
`cloudfront:CreateInvalidation` on the distribution.

### 4. Repository configuration

In **Settings → Secrets and variables → Actions**:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::ACCOUNT_ID:role/baduk-deploy` |
| Variable | `S3_BUCKET` | your bucket name |
| Variable | `AWS_REGION` | e.g. `us-east-1` |
| Variable | `CLOUDFRONT_DISTRIBUTION_ID` | your distribution id |

Then run the **Deploy to S3** workflow from the Actions tab.

## Deploying by hand

```bash
npm run build --workspace @baduk/web

# Hashed assets are immutable — cache them hard.
aws s3 sync apps/web/dist "s3://$BUCKET" \
  --delete --exclude index.html \
  --cache-control "public,max-age=31536000,immutable"

# index.html must never be cached, or visitors run an old app against new assets.
aws s3 cp apps/web/dist/index.html "s3://$BUCKET/index.html" \
  --cache-control "public,max-age=0,must-revalidate"

aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*"
```

## Why the cache headers matter

Vite fingerprints every asset (`index-CqCL8jZk.js`), so those files can be cached forever — their
name changes when their contents do. `index.html` is the one file with a stable name, and it is the
file that points at the fingerprinted assets. Cache it and visitors will keep loading last week's
HTML pointing at assets that no longer exist, which presents as a blank page that only a hard
refresh fixes.

## Cost

At rest this is a few megabytes in S3 and CloudFront's free tier. There is no compute: every bot
move is calculated on the visitor's own machine. A busy month should stay in single-digit dollars.

## When the API arrives

Leaderboards and saved bot weights need persistence, which is the one thing this setup cannot do.
The plan is to add it *beside* the static site rather than under it:

- `/api/*` behind the same CloudFront distribution, pointed at API Gateway.
- Lambda + DynamoDB for profiles, game archives and rankings.
- Trained bot weights published as static JSON in the same bucket, so new personas ship without
  the browser training anything — and the game still works when the API is down.

The important property to preserve: **playing must never require the backend.**
