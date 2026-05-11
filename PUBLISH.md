# Publishing @apicenter/sdk

This SDK can be published to npm (public) or GitHub Packages. Choose the option that fits your setup.

---

## Option A — npm Public Registry (recommended for school projects)

This is the simplest option. The package will be publicly available at `https://www.npmjs.com/package/@apicenter/sdk`.

### Prerequisites
- An npm account at https://www.npmjs.com
- You must own or be a member of the `@apicenter` npm organisation (or create the scoped package on first publish)

### Steps

```bash
cd api-shared

# 1. Log in to npm (one-time setup)
npm login

# 2. Verify the build and publish config look correct
npm run pack:check

# 3. Publish (prepublishOnly runs clean + build automatically)
npm publish
```

### Tribes install with:

```bash
npm install @apicenter/sdk
```

---

## Option B — GitHub Packages

This option keeps the package private to your GitHub organisation. Every consumer needs a GitHub token.

### Step 1 — Add an `.npmrc` inside `api-shared/`

Create `api-shared/.npmrc` (do NOT commit the token — use an environment variable):

```
@apicenter:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

### Step 2 — Switch the registry in `package.json`

Change `publishConfig` to:

```json
"publishConfig": {
  "registry": "https://npm.pkg.github.com",
  "access": "restricted"
}
```

### Step 3 — Publish

```bash
# Export a GitHub PAT with write:packages scope
export GITHUB_TOKEN=ghp_...

cd api-shared
npm run build
npm publish
```

### Tribes add the same `.npmrc` to their repo root:

```
@apicenter:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then install normally:

```bash
npm install @apicenter/sdk
```

---

## After publishing — updating tribe backends

Once the package is live on the chosen registry, each tribe backend should:

1. Remove the `file:` dependency from `package.json`:

   ```diff
   - "@apicenter/sdk": "file:../../api-shared"
   + "@apicenter/sdk": "^1.0.0"
   ```

2. Run `npm install` to pull the published version.

3. Delete any `render-build.sh` step that manually built `api-shared` before the tribe service — it is no longer needed.

---

## Versioning

Bump `version` in `package.json` and `TribeClient.SDK_VERSION` together before each publish.
Use semantic versioning: patch for fixes, minor for new APIs, major for breaking changes.
