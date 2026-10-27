# QUAD Vendor Account Request Portal

A complete frontend-only prototype for requesting and reviewing vendor account onboarding. It provides a responsive QUAD-branded landing page, a guided six-step request form, browser-local draft saving, and simulated submission.

## Features

- Responsive landing page, mobile navigation, benefits, process, and FAQ sections
- Four-step vendor request form with persistent in-session values and section editing
- React Hook Form + Zod validation with conditional requirements and inline errors
- Conditional MSME and CIN fields with GSTIN and bank-routing validation
- Sensitive bank information masked on review and excluded from local storage
- Accessible cancel confirmation, loading states, mock submission, and printable acknowledgement
- Responsive layouts for desktop, tablet, and mobile

## Technology

React 19, Vite, JavaScript, React Router, Tailwind CSS 4, React Hook Form, Zod, and Lucide React.

## Project structure

- `src/components/common`: reusable inputs, buttons, modal, and feedback controls
- `src/components/layout`: shared header, footer, and page container
- `src/components/vendor-request`: vendor form steps, progress, and review UI
- `src/pages`: all route-level pages
- `src/schemas`: Zod validation schema
- `src/data`: reusable form options
- `src/hooks`: form initialization and draft restoration
- `src/utils`: step configuration, formatters, and safe draft storage

## Run locally

```bash
npm install
npm run dev
```

Open the local URL shown by Vite.

## Quality checks

```bash
npm run lint
npm run build
npm run preview
```

## Prototype scope and future backend

This application is intentionally frontend-only. It has no authentication, server, API calls, database, or file upload. Drafts are device-local and explicitly omit sensitive bank values. A future backend can replace the submit timeout with an authenticated API call, while the option lists can be loaded from master-data endpoints. Sensitive bank data should be sent directly to a secure server and must never be persisted in browser storage.
