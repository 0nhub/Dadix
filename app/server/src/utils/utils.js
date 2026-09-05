const isDevEnv = () => {
  return process.env["ENV"] === "dev";
};

const parseExpirationTime = ({ timeString }) => {
  // timeString can be in form {{number}}{{sufix}}
  // and suffix can be s,m,h,d
  // for example 12d is 12 days
  // this function will return number of seconds in passed timeString

  const parsedExpiresIn = parseInt(timeString) || 0;

  // transform expiresIn to seconds
  let expiresInSeconds = parsedExpiresIn;
  if (new RegExp(/[0-9]m/).test(timeString)) {
    // if expiresIn is in minutes (example expireIn="12m")
    expiresInSeconds = parsedExpiresIn * 60;
  } else if (new RegExp(/[0-9]h/).test(timeString)) {
    // if expiresIn is in hours (example expireIn="12h")
    expiresInSeconds = parsedExpiresIn * 60 * 60;
  } else if (new RegExp(/[0-9]d/).test(timeString)) {
    // if expiresIn is in days (example expireIn="12d")
    expiresInSeconds = parsedExpiresIn * 24 * 60 * 60;
  }

  return expiresInSeconds;
};

module.exports = {
  isDevEnv,
  parseExpirationTime,
};
