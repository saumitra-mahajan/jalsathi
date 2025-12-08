const express = require("express");
const cors = require("cors");
const path = require("path");
const metaRoutes = require("./routes/metaRoutes");
const queryRoutes = require("./routes/queryRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

app.use("/api/meta", metaRoutes);
app.use("/api/query", queryRoutes);

// Catch-all for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Centralized error handler
app.use((err, req, res, next) => {
  // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
