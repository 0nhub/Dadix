const app = require("./index.js");
const PORT = process.env.PORT || 6127;

// Start the server
app.listen(PORT, () => {
  console.info(`Server running at ${PORT}`);
});
