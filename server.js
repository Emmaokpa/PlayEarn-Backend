
// A single, stable Node.js server for handling Telegram bot logic with polling.
// This is designed to be deployed on a persistent hosting service like Render.

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');

// --- Firebase Admin Initialization ---
// Ensure you have configured the environment variables in your hosting service.
if (!admin.apps.length) {
  try {
    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    };
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('Firebase Admin initialized successfully.');
  } catch (error) {
    console.error('Firebase admin initialization error:', error);
    process.exit(1); // Exit if Firebase Admin SDK cannot be initialized
  }
}
const firestore = admin.firestore();

// --- Telegram Bot Initialization ---
const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
  console.error('CRITICAL: TELEGRAM_BOT_TOKEN is not configured.');
  process.exit(1);
}

// Initialize the bot with polling. This is for persistent servers, NOT serverless.
const bot = new TelegramBot(botToken, { polling: true });
console.log('Telegram Bot started with polling...');

// --- Helper Functions ---
const USD_TO_STARS_RATE = 113; // Approx. 1 USD = 113 Telegram Stars
const COIN_TO_USD_RATE = 0.001; // 1000 coins = 1 USD

async function getProductDetails(productId, purchaseType) {
  const docRef = firestore.collection(purchaseType).doc(productId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) {
    console.error(`Product with ID ${productId} not found in ${purchaseType}.`);
    return null;
  }
  return docSnap.data();
}

async function handlePurchaseRequest(chatId, userId, purchaseType, productId) {
    console.log(`Purchase command received from ${userId} for ${purchaseType} ${productId}`);
    
    if (purchaseType !== 'inAppPurchases' && purchaseType !== 'stickerPacks') {
      return bot.sendMessage(chatId, "Invalid purchase type.");
    }

    try {
        const product = await getProductDetails(productId, purchaseType);
        if (!product) {
            return bot.sendMessage(chatId, "Sorry, that product could not be found.");
        }

        const isPhysical = product.type === 'physical';
        // Payload format: `purchaseType|productId|userId`
        const payload = `${purchaseType}|${productId}|${userId}`;
        
        let invoiceArgs = {
            title: product.name,
            description: product.description,
            payload: payload,
            photo_url: product.imageUrl,
            photo_width: 600,
            photo_height: 400,
        };

        if (isPhysical) {
             // Physical goods paid with real currency
            const physicalProviderToken = process.env.TELEGRAM_PHYSICAL_PROVIDER_TOKEN;
            if (!physicalProviderToken) {
                console.error("TELEGRAM_PHYSICAL_PROVIDER_TOKEN is not set for physical goods.");
                return bot.sendMessage(chatId, "The payment provider for physical goods is not configured.");
            }
            const priceInCents = Math.round(product.price * 100);
            Object.assign(invoiceArgs, {
                provider_token: physicalProviderToken,
                currency: 'USD',
                prices: [{ label: product.name, amount: priceInCents }],
                need_shipping_address: true,
            });
        } else {
            // Digital goods (coins, spins, stickers) paid with Telegram Stars
            let priceInStars;
            if (purchaseType === 'stickerPacks') {
                // For stickers, price is in coins. Convert coins to USD then to Stars.
                priceInStars = Math.round(product.price * COIN_TO_USD_RATE * USD_TO_STARS_RATE);
            } else {
                // For coin/spin packs, price is in USD. Convert directly to Stars.
                priceInStars = Math.round(product.price * USD_TO_STARS_RATE);
            }
            // Minimum price for stars is 1 star.
            if (priceInStars < 1) priceInStars = 1;

            Object.assign(invoiceArgs, {
                provider_token: '', // Not needed for Stars
                currency: 'XTR',
                prices: [{ label: product.name, amount: priceInStars }]
            });
        }
        
        await bot.sendInvoice(chatId, invoiceArgs.title, invoiceArgs.description, invoiceArgs.payload, invoiceArgs.provider_token, invoiceArgs.currency, invoiceArgs.prices, { photo_url: invoiceArgs.photo_url, photo_width: invoiceArgs.photo_width, photo_height: invoiceArgs.photo_height });

    } catch (error) {
        console.error("Error creating invoice:", error);
        bot.sendMessage(chatId, "Sorry, there was an error creating your payment request.");
    }
}


// --- Bot Logic ---

// Listen for the /start command with a deep link payload
bot.onText(/\/start purchase-(.+)-(.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const purchaseType = match[1]; // e.g., 'inAppPurchases' or 'stickerPacks'
  const productId = match[2]; // e.g., 'pack1'
  
  handlePurchaseRequest(chatId, userId, purchaseType, productId);
});

// Generic /start command
bot.onText(/^\/start$/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `Welcome to RewardPlay! Your Chat ID is: ${chatId}. You can use this to link your account in the app.`);
});

// A command to manually trigger a purchase for testing purposes.
bot.onText(/\/purchase (.+) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const purchaseType = match[1]; // e.g., 'inAppPurchases'
    const productId = match[2]; // e.g., 'pack1'
    
    await handlePurchaseRequest(chatId, userId, purchaseType, productId);
});


// --- Webhook Handlers (via Polling) ---

// Handle the pre-checkout query. This is required for payments.
bot.on('pre_checkout_query', (preCheckoutQuery) => {
  console.log(`Answering pre-checkout query for ${preCheckoutQuery.from.first_name}`);
  bot.answerPreCheckoutQuery(preCheckoutQuery.id, true)
    .catch(err => console.error("Error answering pre-checkout query:", err));
});

// Handle a successful payment.
bot.on('successful_payment', async (msg) => {
  const chatId = msg.chat.id;
  const payment = msg.successful_payment;
  console.log(`Successful payment received from chat ${chatId}`);

  try {
    const [purchaseType, productId, userId] = payment.invoice_payload.split('|');

    if (!purchaseType || !productId || !userId) {
      throw new Error(`Invalid invoice payload received: ${payment.invoice_payload}`);
    }

    const userRef = firestore.collection('users').doc(userId);
    const product = await getProductDetails(productId, purchaseType);

    if (!product) {
      throw new Error(`Product ${productId} from payload not found.`);
    }

    // Award the item to the user
    if (purchaseType === 'inAppPurchases') {
      const pack = product; // It's an InAppPurchase
      if (pack.type === 'coins') {
        await userRef.update({ coins: admin.firestore.FieldValue.increment(pack.amount) });
        console.log(`Awarded ${pack.amount} coins to user ${userId}.`);
        await bot.sendMessage(chatId, `Thank you for your purchase! ${pack.amount.toLocaleString()} coins have been added to your account.`);
      } else if (pack.type === 'spins') {
        // Assuming you have a 'spinData' subcollection
        const spinDataRef = firestore.doc(`users/${userId}/spinData/spin_status`);
        await spinDataRef.set({
            purchasedSpinsRemaining: admin.firestore.FieldValue.increment(pack.amount)
        }, { merge: true });
        console.log(`Awarded ${pack.amount} spins to user ${userId}.`);
        await bot.sendMessage(chatId, `Thank you for your purchase! ${pack.amount.toLocaleString()} spins have been added to your account.`);
      }
    } else if (purchaseType === 'stickerPacks') {
      // For sticker packs, we need to deduct the coin cost from the user
      const userDoc = await userRef.get();
      if (userDoc.exists && userDoc.data().coins >= product.price) {
          await userRef.update({ coins: admin.firestore.FieldValue.increment(-product.price) });
          // In a real app, you would add the sticker pack to the user's collection here.
          console.log(`User ${userId} purchased sticker pack ${productId} for ${product.price} coins.`);
          await bot.sendMessage(chatId, `Thank you for your purchase! You've unlocked the "${product.name}" sticker pack.`);
      } else {
          console.log(`User ${userId} has insufficient coins for sticker pack ${productId}.`);
          await bot.sendMessage(chatId, `Sorry, you do not have enough coins to purchase the "${product.name}" sticker pack.`);
      }
    }

  } catch (error) {
    console.error('Error processing successful payment:', error);
    bot.sendMessage(chatId, 'There was an issue processing your purchase. Please contact support.');
  }
});

// --- Error Handling for Polling ---
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.code, '-', error.message);
});

console.log('RewardPlay Bot Server is running...');
