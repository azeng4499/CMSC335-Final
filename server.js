require("dotenv").config();
const OpenAI = require("openai");
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const { MongoClient, ServerApiVersion } = require("mongodb");
const app = express();
const PORT_NUMBER = 3000;
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "templates"));
app.use(express.static(path.join(__dirname, "public")));

const mongoConnectionString = process.env.MONGO_COLLECTION_STRING;
const databaseName = process.env.MONGO_DB_NAME;
const collectionName = process.env.MONGO_COLLECTION;

const mongoClient = new MongoClient(mongoConnectionString, {
  serverApi: ServerApiVersion.v1,
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/form", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "form.html"));
});

app.post("/form", async (req, res) => {
  const { name, feeling } = req.body;

  if (!name || !feeling || name.length == 0 || feeling.length == 0) {
    res.redirect("/form");
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_KEY,
  });

  const getFormattedDate = () => {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, "0");

    let hours = now.getHours();
    const minutes = pad(now.getMinutes());
    const seconds = pad(now.getSeconds());
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;

    const formatted = `${pad(now.getMonth() + 1)}/${pad(
      now.getDate()
    )}/${now.getFullYear()} ${pad(hours)}:${minutes}:${seconds} ${ampm}`;

    return formatted;
  };

  async function getAndStoreQuote(attempt = 1) {
    try {
      const response = await client.responses.create({
        model: "gpt-4.1",
        input: `Find a real, lesser-known quote about ${feeling}. Avoid famous or commonly used quotes. Respond in the format: "QUOTE" - AUTHOR. Make sure the quote is unique and not one of the first results found online.`,
      });

      const result = response.output_text;
      const regex = /^"(.*?)"\s*-\s*(.+)$/;
      const match = result.match(regex);

      if (!match) throw new Error();

      const quote = match[1];
      const author = match[2];

      await mongoClient.connect();
      const database = mongoClient.db(databaseName);
      const collection = database.collection(collectionName);

      const newApplicant = {
        name,
        quote,
        author,
        feeling,
        timestamp: getFormattedDate(),
      };

      await collection.insertOne(newApplicant);

      res.render("result", { name, quote, author, feeling });
      return;
    } catch (e) {
      console.log(`Attempt ${attempt} failed:`, e.message);
      if (attempt < 3) {
        await getAndStoreQuote(attempt + 1);
      } else {
        res.status(500).send("Error: could not call API");
        return;
      }
    }
  }

  await getAndStoreQuote();
});

app.get("/quote-history", async (req, res) => {
  await mongoClient.connect();
  const database = mongoClient.db(databaseName);
  const collection = database.collection(collectionName);

  const allEntries = await collection.find({}).toArray();

  let tableHTML = "<table><tr><th>User</th><th>Quote</th><th>Author</th></tr>";

  allEntries.forEach((e) => {
    tableHTML += `<tr><td>${e.name}</td><td>${e.quote}</td><td>${e.author}</td></tr>`;
  });

  tableHTML += "</table>";

  res.render("history", { tableHTML });
});

app.listen(PORT_NUMBER, () => {
  console.log(
    `Web server started and running at http://localhost:${PORT_NUMBER}`
  );
});
