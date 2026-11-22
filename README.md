# SalonBook – Server

The backend REST API for **SalonBook**, a salon appointment booking platform. Built with Express 5 and MongoDB, the server handles authentication, authorization, service management, appointment booking, image uploads, and secure online payments.

## 🌐 Live API

**Production API:** https://salonbook-server-beta-seven.vercel.app

## ✨ Key Features

### 🔐 Authentication & Authorization
- Better Auth integration.
- Email/password authentication.
- Google OAuth authentication.
- JWT generation and verification.
- JWKS-based public key verification using `jose`.
- Role-based access control for customers and administrators.
- Protected API endpoints.
- Server-side authorization and appointment ownership verification.

### 💇 Service Management
- Retrieve all available salon services.
- Search and filter services.
- Category-based filtering.
- Price sorting and pagination.
- Retrieve individual service details.
- Admin-only service creation, updating, and deletion.
- Manage service availability.

### 📅 Appointment Management
- Customers can book salon appointments.
- Customers can view their own appointments.
- Customers can cancel their eligible pending appointments.
- Administrators can view and manage appointments.
- Admins can confirm or cancel eligible appointments.
- Appointment ownership protection.
- Prevent duplicate time-slot bookings using a unique partial MongoDB index.

### 🖼️ Image Upload
- ImgBB image hosting integration.
- Image uploads through Multer.
- Protected image upload endpoint.
- Image URLs stored in MongoDB.

### 💳 Payment Integration
- Stripe Checkout integration.
- Secure payment session creation.
- Stripe webhook verification.
- Payment status verification.
- Automatic appointment payment updates.
- Transaction record creation.
- Admin transaction management.

### 👥 User Management
- Retrieve authenticated user profile.
- Update profile information.
- Admin-only user management.
- Block and unblock customer accounts.

### 📊 Admin Statistics
- Dedicated administrator statistics endpoint.
- Dashboard metrics for platform management.

## 🧰 Technology Stack

| Category | Technologies |
|---|---|
| Runtime | Node.js |
| Backend Framework | Express 5 |
| Database | MongoDB (Native Driver) |
| Authentication | Better Auth |
| Token Verification | jose (JWT/JWKS) |
| Validation | Zod |
| Image Processing | Multer |
| Image Hosting | ImgBB |
| Payment Gateway | Stripe |
| API Architecture | REST API |
| Deployment | Vercel |

## 📦 Installation

### Prerequisites
- Node.js
- npm
- MongoDB database
- Google Cloud OAuth credentials (if enabling Google sign-in)
- ImgBB API key
- Stripe account and Stripe CLI (for payment testing)

### 1. Clone the repository

```bash
git clone YOUR_SERVER_REPOSITORY_URL
```

### 2. Navigate to the project directory

```bash
cd salonbook-server
```

### 3. Install dependencies

```bash
npm install
```

### 4. Configure environment variables

Create a `.env` file in the project root and configure the required variables.

See the Environment Variables section below.

### 5. Start the development server

```bash
npm run dev
```

The API should run at:

http://localhost:5001

### 6. Create the administrator account

After registering an account using the configured administrator email, run:

```bash
npm run seed:admin
```

The administrator email is configured through `ADMIN_EMAIL`.

## 🔑 Environment Variables

Create a `.env` file and configure the following variables:

| Variable | Description |
|---|---|
| `PORT` | Backend server port |
| `NODE_ENV` | Application environment |
| `CLIENT_URL` | Frontend application URL |
| `BETTER_AUTH_URL` | Better Auth public URL, issuer, and audience configuration |
| `AUTH_JWKS_URL` | Public JWKS endpoint |
| `BETTER_AUTH_SECRET` | Better Auth secret |
| `MONGODB_URI` | MongoDB connection string |
| `DB_NAME` | MongoDB database name |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `IMGBB_API_KEY` | ImgBB image hosting API key |
| `STRIPE_SECRET_KEY` | Stripe secret API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `BDT_TO_USD_RATE` | BDT-to-USD conversion rate |
| `ADMIN_EMAIL` | Email used by the admin seeding script |

**Security:** Never commit `.env` files, API keys, database credentials, OAuth secrets, JWT secrets, or Stripe credentials to GitHub.

## 📡 API Overview

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| Various | `/api/auth/*` | Better Auth authentication routes |
| GET | `/api/auth/token` | Generate or retrieve JWT |

### Services

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/services` | Public |
| GET | `/api/services/:id` | Public |
| GET | `/api/services/manage` | Admin |
| POST | `/api/services` | Admin |
| PATCH | `/api/services/:id` | Admin |
| DELETE | `/api/services/:id` | Admin |

### Appointments

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/appointments` | Customer |
| GET | `/api/appointments/my` | Authenticated Customer |
| PATCH | `/api/appointments/:id/cancel` | Appointment Owner |
| GET | `/api/appointments/admin` | Admin |
| PATCH | `/api/appointments/admin/:id/confirm` | Admin |
| PATCH | `/api/appointments/admin/:id/cancel` | Admin |

### Payments

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/payments/create-checkout-session` | Authenticated Customer |
| GET | `/api/payments/session-status` | Authenticated Customer |
| GET | `/api/payments/transactions` | Admin |

### Webhooks

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/webhooks/stripe` | Stripe payment webhook |

### Users

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/users/me` | Authenticated User |
| PATCH | `/api/users/me` | Authenticated User |
| GET | `/api/users` | Admin |
| PATCH | `/api/users/:id/block` | Admin |
| PATCH | `/api/users/:id/unblock` | Admin |

### Statistics

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/stats/admin` | Admin |

### Image Upload

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/upload` | Authenticated User |

**Image upload:** Use the multipart form-data field named `image`.

## 🛡️ Important Business Rules

- Customers can only access their own appointments.
- Customers cannot access administrator-only endpoints.
- Only appointment owners can cancel their eligible appointments.
- Only confirmed and unpaid appointments can be paid.
- Paid appointments cannot be cancelled by administrators.
- A time slot can only be booked once.
- Duplicate time slots are prevented through a unique partial MongoDB index.
- Protected endpoints require appropriate authentication and authorization.

## 💳 Stripe Payment Testing

### 1. Install and authenticate Stripe CLI

```bash
stripe login
```

### 2. Start the webhook listener

```bash
stripe listen --forward-to localhost:5000/api/webhooks/stripe
```

Stripe CLI will generate a webhook signing secret.

Add it to your server `.env`:

```env
STRIPE_WEBHOOK_SECRET=your_webhook_signing_secret
```

### 3. Complete a test payment

1. Book a salon service as a customer.
2. Confirm the appointment as an administrator.
3. Click **Pay Now** from the customer dashboard.
4. Use the Stripe test card:

| Field | Test Value |
|---|---|
| Card Number | `4242 4242 4242 4242` |
| Expiry | Any future date |
| CVC | Any 3 digits |

The Stripe webhook processes the successful payment, updates the appointment to **Paid**, and creates a transaction record.

## 🚀 Deployment

The backend is designed to be deployed on Vercel.

1. Import the server repository into Vercel.
2. Configure all required environment variables in Vercel Project Settings.
3. Set the correct production frontend and authentication URLs.
4. Deploy the backend.
5. Configure the Stripe production webhook endpoint:

```text
https://YOUR_SERVER_DOMAIN/api/webhooks/stripe
```

6. Subscribe to these Stripe events:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
```

7. Copy the production webhook signing secret into `STRIPE_WEBHOOK_SECRET`.
8. Redeploy the backend after updating environment variables.

## 🔗 Project Repositories

- **Client Repository:** https://github.com/CodesByHasan/salonbook-client
- **Server Repository:** https://github.com/CodesByHasan/salonbook-server

## 👨‍💻 Author

**Mehedi Hasan**

## 📄 License

This project was developed as a learning and portfolio project.
