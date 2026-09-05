const jwt = require("jsonwebtoken");

const generateEncodedAPIKey = () => {
  const APIKeyLength = 64;
  let apiKey = generateRandomString({ length: APIKeyLength });

  let encodedApiKey = encodeText({ text: apiKey });
  return encodedApiKey;
};

const encodeAPIKey = ({ APIKey }) => {
  return encodeText({ text: APIKey });
};

const decodeAPIKey = ({ encodedApiKey }) => {
  return decodeText({ encodedText: encodedApiKey }).key;
};

const generateRandomString = ({ length }) => {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  let randomText = "";
  for (let i = 0; i < length; i++) {
    randomText += characters.charAt(
      Math.floor(Math.random() * characters.length)
    );
  }

  return randomText;
};

const swappTextChars = ({ text }) => {
  if (text.length < 4) {
    return text;
  }
  let swappedTextChars = "";
  let firstHalf = "";
  let secondHalf = "";
  for (let i = 0, textHalfLength = text.length >> 1; i < text.length; i++) {
    if (i < textHalfLength) {
      secondHalf += text.substring(i, i + 1);
    } else {
      firstHalf += text.substring(i, i + 1);
    }
  }
  for (let i = 0; i < firstHalf.length; i += 2) {
    swappedTextChars += firstHalf.substring(i + 1, i + 2);
    swappedTextChars += firstHalf.substring(i, i + 1);
  }
  for (let i = 0; i < secondHalf.length; i += 2) {
    swappedTextChars += secondHalf.substring(i + 1, i + 2);
    swappedTextChars += secondHalf.substring(i, i + 1);
  }

  return swappedTextChars;
};

const encodeText = ({ text }) => {
  /*const textToJWT = jwt.sign({ key: text }, process.env["API_KEY_SECRET"]);
  console.log(textToJWT)
  let [jwtHeader, jwtPayload, jwtSignature] = textToJWT.split(".");*/
  let jwtPayload = Buffer.from(JSON.stringify({ key: text }), "utf8").toString(
    "base64url"
  );

  if (jwtPayload.length % 2 !== 0) {
    jwtPayload += "_";
  }
  return swappTextChars({ text: jwtPayload });
};

const decodeText = ({ encodedText }) => {
  if (!encodedText) return null;

  let preDecodedText = swappTextChars({
    text: encodedText,
  }).replace("_", "");

  const tempJWT = jwt.sign(
    { key: preDecodedText },
    process.env["API_KEY_SECRET"]
  );
  const [jwtHeader, jwtPayload, jwtSignature] = tempJWT.split(".");
  const textToJWT = `${jwtHeader}.${preDecodedText}.${jwtSignature}`;

  const decodedText = jwt.decode(textToJWT.trim());
  return decodedText;
};

module.exports = {
  generateEncodedAPIKey,
  encodeAPIKey,
  decodeAPIKey,
};
