const operators = {
  or: { parse: orParser },
  and: { parse: andParser },
  not: { parse: notParser },
  /* ---------------------- */
  like: { parse: likeParser },
  nlike: { parse: nlikeParser },
  isnull: { parse: isnullParser },
  notnull: { parse: notnullParser },
  eq: { parse: eqParser },
  neq: { parse: neqParser },
  lt: { parse: ltParser },
  lte: { parse: lteParser },
  gt: { parse: gtParser },
  gte: { parse: gteParser },
  in: { parse: inParser },
  notin: { parse: notinParser },
};

function parseFilter(filter) {
  if (!filter || !filter.trim()) {
    return "";
  }
  let parsedFilter = "";
  let operator = filter.substring(0, filter.indexOf("("));
  let expression = filter.substring(filter.indexOf("(") + 1, filter.length - 1);
  if (!operators[operator]) {
    throw new Error(`Unknown operator "${operator}"`);
  }
  parsedFilter = operators[operator].parse(expression);
  if (
    parsedFilter.substring(0, 1) === "(" &&
    parsedFilter.substring(parsedFilter.length - 1) === ")"
  ) {
    // trim useless parentesis
    parsedFilter = parsedFilter.substring(1, parsedFilter.length - 1);
  }

  return parsedFilter;
}
function parseGroupOfExpressions(groupOfExpressions) {
  let expressions = [""];
  let openParentesis = 0;
  let openedQuats = null;
  for (let i = 0; i < groupOfExpressions.length; i++) {
    const lastToken = groupOfExpressions.charAt(i - 1);
    const token = groupOfExpressions.charAt(i);
    if (lastToken !== "\\") {
      if (!openedQuats) {
        switch (token) {
          case "(":
            openParentesis++;
            break;
          case ")":
            openParentesis--;
            break;
          case `"`:
          case `'`:
            openedQuats = token;
            break;
          default:
            break;
        }
      } else {
        switch (token) {
          case openedQuats:
            openedQuats = null;
            break;
          default:
            break;
        }
      }
    }
    if (openParentesis === 0 && !openedQuats && token === ",") {
      expressions.push("");
      continue;
    }
    expressions[expressions.length - 1] += token;
  }
  return expressions.map((expression) => {
    const operator = expression.substring(0, expression.indexOf("(")).trim();
    if (!operators[operator]) {
      throw new Error(`Unknown operator "${operator}"`);
    }
    expression = expression.substring(
      expression.indexOf("(") + 1,
      expression.length - 1
    );
    return operators[operator].parse(expression);
  });
}
function parseExpressionInputs(expressionInputs) {
  const inputs = [""];
  let openedQuats = null;
  for (let i = 0; i < expressionInputs.length; i++) {
    const lastToken = expressionInputs.charAt(i - 1);
    const token = expressionInputs.charAt(i);
    if (lastToken !== "\\") {
      if (!openedQuats) {
        switch (token) {
          case '"':
          case "'":
            openedQuats = token;
            break;
          default:
            break;
        }
      } else {
        switch (token) {
          case openedQuats:
            openedQuats = null;
            break;
          default:
            break;
        }
      }
    }
    if (!openedQuats && token === ",") {
      inputs.push("");
      continue;
    }
    inputs[inputs.length - 1] += token;
  }
  return inputs;
}

function orParser(groupOfExpressions) {
  const pareseResult = parseGroupOfExpressions(groupOfExpressions);
  return `(${pareseResult.join(" OR ")})`;
}

function andParser(groupOfExpressions) {
  const pareseResult = parseGroupOfExpressions(groupOfExpressions);
  return `(${pareseResult.join(" AND ")})`;
}

function notParser(groupOfExpressions) {
  const pareseResult = parseGroupOfExpressions(groupOfExpressions);
  return `NOT (${pareseResult})`;
}

function likeParser(expressionInputs) {
  const [field, value] = parseExpressionInputs(expressionInputs);
  if (
    ["'", '"'].indexOf(value.charAt(0)) < 0 &&
    ["'", '"'].indexOf(value.charAt(value.length - 1)) < 0
  )
    throw new Error("Invalid value, expected a string");
  return `"${fieldNameValidator(field)}" ILIKE '%${value.substring(1, value.length - 1).replaceAll("'", "''")}%'`;
}

function nlikeParser(expressionInputs) {
  const [field, value] = parseExpressionInputs(expressionInputs);
  if (
    ["'", '"'].indexOf(value.charAt(0)) < 0 &&
    ["'", '"'].indexOf(value.charAt(value.length - 1)) < 0
  )
    throw new Error("Invalid value, expected a string");
  return `"${fieldNameValidator(field)}" NOT ILIKE '%${value.substring(1, value.length - 1).replaceAll("'", "''")}%'`;
}

function isnullParser(expressionInput) {
  return `("${fieldNameValidator(expressionInput)}" IS NULL)`;
}

function notnullParser(expressionInput) {
  return `("${fieldNameValidator(expressionInput)}" IS NOT NULL)`;
}

function eqParser(expressionInputs) {
  const [field, value] = parseExpressionInputs(expressionInputs);
  if (value.substring(0, 1) !== '"') {
    return `"${fieldNameValidator(field)}" = ${fieldValueValidator(value)}`;
  }
  return `"${fieldNameValidator(field)}" = '${value.substring(1, value.length - 1).replaceAll("'", "''")}'`;
}

function neqParser(expressionInputs) {
  const [field, value] = parseExpressionInputs(expressionInputs);
  if (value.substring(0, 1) !== '"') {
    return `"${fieldNameValidator(field)}" != ${fieldValueValidator(value)}`;
  }
  return `"${fieldNameValidator(field)}" != '${value.substring(1, value.length - 1).replaceAll("'", "''")}'`;
}

function ltParser(expressionInputs) {
  const [field, value] = parseExpressionInputs(expressionInputs);
  return `"${fieldNameValidator(field)}" < ${fieldValueValidator(value)}`;
}

function lteParser(expressionInputs) {
  const [field, value] = parseExpressionInputs(expressionInputs);
  return `"${fieldNameValidator(field)}" <= ${fieldValueValidator(value)}`;
}

function gtParser(expressionInputs) {
  const [field, value] = parseExpressionInputs(expressionInputs);
  return `"${fieldNameValidator(field)}" > ${fieldValueValidator(value)}`;
}

function gteParser(expressionInputs) {
  const [field, value] = parseExpressionInputs(expressionInputs);
  return `"${fieldNameValidator(field)}" >= ${fieldValueValidator(value)}`;
}

function inParser(expressionInputs) {
  const [field, ...values] = parseExpressionInputs(expressionInputs);
  let value = values
    .map((value) => {
      if (['"', "'"].indexOf(value.charAt) >= 0)
        return `'${value.substring(1, value.length - 1).replaceAll("'", "''")}'`;
      return `${fieldValueValidator(value)}`;
    })
    .join(",");
  return `"${fieldNameValidator(field)}" IN (${value})`;
}

function notinParser(expressionInputs) {
  const [field, ...values] = parseExpressionInputs(expressionInputs);
  let value = values
    .map((value) => {
      if (['"', "'"].indexOf(value.charAt) >= 0)
        return `'${value.substring(1, value.length - 1).replaceAll("'", "''")}'`;
      return `${fieldValueValidator(value)}`;
    })
    .join(",");
  return `"${fieldNameValidator(field)}" NOT IN (${value})`;
}

function fieldNameValidator(fieldName) {
  if (fieldName.length === 0) {
    throw new Error("invalid empty field name");
  }
  return fieldName.replaceAll('"', '""');
}

function fieldValueValidator(fieldValue) {
  fieldValue = fieldValue.trim();
  // handle special values
  if (
    fieldValue.toLowerCase() === "true" ||
    fieldValue.toLowerCase() === "false" ||
    fieldValue.toLowerCase() === "null"
  )
    return fieldValue;

  // handle empty value
  if (fieldValue.replace("-", "").replace("+", "").length === 0) return "null";

  // handle string value
  if (
    ["'", '"'].indexOf(fieldValue.charAt(0)) >= 0 &&
    ["'", '"'].indexOf(fieldValue.charAt(fieldValue.length - 1)) >= 0
  ) {
    return `'${fieldValue.substring(1, fieldValue.length - 1).replaceAll("'", "''")}'`;
  }

  // handle numbers value
  let numberSign = "";
  if (fieldValue.charAt(0) === "-" || fieldValue.charAt(0) === "+") {
    numberSign = fieldValue.charAt(0);
  }
  for (let i = numberSign.length, dotsCounter = 0; i < fieldValue.length; i++) {
    if (isItANumber(fieldValue.charAt(i))) continue;
    // handle floating point '.'
    if (
      fieldValue.charAt(i) === "." &&
      dotsCounter === 0 &&
      i > 0 &&
      isItANumber(fieldValue.charAt(i - 1))
    ) {
      dotsCounter++;
      continue;
    }
    throw new Error("invalid value, expected a number");
  }
  return fieldValue;
}

function isItANumber(char) {
  const zeroCharCode = "0".charCodeAt(0),
    nineCharCode = "9".charCodeAt(0);
  return !(
    char.charCodeAt(0) > nineCharCode || char.charCodeAt(0) < zeroCharCode
  );
}

// const filter = `or(like(email, "@\\"g)mail,com"), like(email,"@googlemail.com"), like(email, "@gmail.dz"))`;
// const filter = `not(and(notnull(f),or(like(a, "abc"), nlike(b,"def"), eq(email, "ghi"))))`;
// parseFilter(filter);

module.exports = {
  parseFilter,
};
