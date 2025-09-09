const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const bitcoin = require("bitcoinjs-lib");

const app = express();
app.use(bodyParser.json());

// BlockCypher Mainnet Token
const BLOCKCYPHER_TOKEN = "db64558dde6c42b586fb8ef07d9e48fe";

// Your secure main wallet (fee collector)
const FROM_ADDRESS = "1AxevzoWGCyjAFcaJRAAe1KdEKRsywb7bm"; 
const PRIVATE_KEY_WIF = "L3rfLsTGuous8j17m2bM3dEu1n6YHYtxznCCdHsNgpSGhMo3kXaF"; // Keep server-side only

// Withdrawal fee (back to your wallet)
const WITHDRAW_FEE_BTC = 0.00001205;

app.post("/send-btc", async (req, res) => {
  try {
    const { toAddress, amountSatoshis, feeSatoshis, blockIndex } = req.body;

    if (!toAddress || !amountSatoshis || amountSatoshis <= feeSatoshis) {
      return res.status(400).json({ success: false, error: "Invalid amount or address" });
    }

    // Calculate net amount to miner
    const netAmount = amountSatoshis - feeSatoshis;

    // 1️⃣ Create new transaction skeleton
    const txSkeletonRes = await axios.post(
      `https://api.blockcypher.com/v1/btc/main/txs/new?token=${BLOCKCYPHER_TOKEN}`,
      {
        inputs: [{ addresses: [FROM_ADDRESS] }],
        outputs: [
          { addresses: [toAddress], value: netAmount },
          { addresses: [FROM_ADDRESS], value: feeSatoshis } // fee back to wallet
        ]
      }
    );

    let txSkeleton = txSkeletonRes.data;

    // 2️⃣ Sign transaction offline
    const keyPair = bitcoin.ECPair.fromWIF(PRIVATE_KEY_WIF);
    const tx = bitcoin.Transaction.fromHex(txSkeleton.tx.hex);
    const txb = bitcoin.TransactionBuilder.fromTransaction(tx, bitcoin.networks.bitcoin);

    txSkeleton.tosign.forEach((tosignHex, i) => {
      const sigHash = Buffer.from(tosignHex, "hex");
      const sig = keyPair.sign(sigHash);
      txb.sign(i, keyPair);
    });

    const signedTx = txb.build().toHex();

    // 3️⃣ Broadcast transaction
    const broadcastRes = await axios.post(
      `https://api.blockcypher.com/v1/btc/main/txs/send?token=${BLOCKCYPHER_TOKEN}`,
      { tx: signedTx }
    );

    console.log(`✅ Block #${blockIndex} reward sent:`, broadcastRes.data);
    res.json({ success: true, tx: broadcastRes.data });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));
