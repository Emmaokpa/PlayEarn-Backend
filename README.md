# RewardPlay Backend Server

This Node.js server runs the Telegram bot using a polling mechanism. It is designed to be deployed on a persistent hosting service like Render.

## Setup and Deployment

### 1. Prepare Your GitHub Repository
Before deploying, make sure your new GitHub repository (e.g., `PlayEarn-Backend`) contains the following files from this directory:
- `server.js`
- `package.json`
- `README.md` (this file)

### 2. Deploy to Render (Step-by-Step)
Render is a service that can run this server for you 24/7. Follow these steps:

1.  **Sign Up & Dashboard:**
    *   Create a free account on [Render.com](https://render.com/).
    *   From your dashboard, click **New +** and select **Web Service**.

2.  **Connect Your Repository:**
    *   Choose "Build and deploy from a Git repository".
    *   Connect your GitHub account and find your `PlayEarn-Backend` repository. Select it.

3.  **Configure the Service:**
    *   **Name:** Give your service a unique name (e.g., `playearn-bot-server`).
    *   **Region:** Choose a region closest to you.
    *   **Root Directory:** Leave this field **blank**. This is important!
    *   **Branch:** Select `main`.
    *   **Runtime:** Render should automatically detect `Node`.
    *   **Build Command:** Set this to `npm install`.
    *   **Start Command:** Set this to `node server.js`.
    *   **Instance Type:** Select the **Free** tier.

4.  **Add Environment Variables:**
    *   Before you create the service, scroll down to the "Advanced" section.
    *   Click **Add Environment Variable**. You need to add all the secrets from your `.env` file here, one by one.
    *   **Required Variables:**
        *   `TELEGRAM_BOT_TOKEN`
        *   `TELEGRAM_PHYSICAL_PROVIDER_TOKEN` (See note below)
        *   `FIREBASE_PROJECT_ID`
        *   `FIREBASE_CLIENT_EMAIL`
        *   `FIREBASE_PRIVATE_KEY` (For this one, copy the entire key, including the `-----BEGIN...` and `-----END...` parts. Render handles multi-line secrets correctly).
    *   Double-check that the keys and values are correct.

    **IMPORTANT NOTE ON PAYMENT PROVIDER TOKEN:**
    The `TELEGRAM_PHYSICAL_PROVIDER_TOKEN` is **NOT** your Flutterwave token. It must come from a payment provider that is directly supported by Telegram (e.g., **Stripe**, which is the most common). To get this token:
    1. Create an account with a supported provider like Stripe.
    2. In Telegram, go to `@BotFather`, select your bot, and go to `Bot Settings` -> `Payments`.
    3. Follow the instructions to connect your provider (e.g., Stripe) to your bot.
    4. Once connected, `@BotFather` will give you the token. Use that token for this environment variable.
    5. You can leave this blank for now to test digital (Telegram Stars) payments.

5.  **Create the Service:**
    *   Click the **Create Web Service** button.
    *   Render will now start building and deploying your server. You can watch the logs on the screen.

Once deployed, this server will run 24/7, handling all Telegram bot interactions and payments. If it says "Deploy failed", check the logs for errors. The most common issues are a missing environment variable or a typo in the build/start commands.
