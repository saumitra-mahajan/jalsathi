require("dotenv").config();
const app = require("./app");

// Prefer externally provided port; otherwise fall back to a non-secret default.
const PORT = process.env.PORT || 8888;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
