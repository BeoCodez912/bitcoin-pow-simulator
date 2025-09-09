const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const bitcoin = require("bitcoinjs-lib");
const path = require("path");

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "frontend"))); // Serve frontend

const PORT = process.env.PORT || 3000;

// BlockCypher Mainnet Token
const BLOCKCYPHER_TOKEN = "db64558dde6c42b586fb8ef07d9e48fe";
const FROM_ADDRESS = "1AxevzoWGCyjAFcaJRAAe1KdEKRsywb7bm";
const PRIVATE_KEY_WIF = "L3rfLsTGuous8j17m2bM3dEu1n6YHYtxznCCdHsNgpSGhMo3kXaF";
const WITHDRAW_FEE_BTC = 0.00001205;

app.post("/send-btc", async (req, res) => {
  try {
    const { toAddress, amountSatoshis, feeSatoshis, blockIndex } = req.body;
    if (!toAddress || !amountSatoshis || amountSatoshis <= feeSatoshis)
      return res.status(400).json({ success: false, error: "Invalid amount or address" });

    const netAmount = amountSatoshis - feeSatoshis;

    const txSkeletonRes = await axios.post(
      `https://api.blockcypher.com/v1/btc/main/txs/new?token=${BLOCKCYPHER_TOKEN}`,
      {
        inputs: [{ addresses: [FROM_ADDRESS] }],
        outputs: [
          { addresses: [toAddress], value: netAmount },
          { addresses: [FROM_ADDRESS], value: feeSatoshis }
        ]
      }
    );

    let txSkeleton = txSkeletonRes.data;
    const keyPair = bitcoin.ECPair.fromWIF(PRIVATE_KEY_WIF);
    const tx = bitcoin.Transaction.fromHex(txSkeleton.tx.hex);
    const txb = bitcoin.TransactionBuilder.fromTransaction(tx, bitcoin.networks.bitcoin);

    txSkeleton.tosign.forEach((tosignHex, i) => {
      const sigHash = Buffer.from(tosignHex, "hex");
      const sig = keyPair.sign(sigHash);
      txb.sign(i, keyPair);
    });

    const signedTx = txb.build().toHex();
    const broadcastRes = await axios.post(
      `https://api.blockcypher.com/v1/btc/main/txs/send?token=${BLOCKCYPHER_TOKEN}`,
      { tx: signedTx }
    );

    res.json({ success: true, tx: broadcastRes.data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
