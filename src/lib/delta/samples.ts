export const SAMPLE_BEFORE = `function greet(name) {
  console.log("Hello " + name);
  return true;
}

module.exports = greet;
`;

export const SAMPLE_AFTER = `function greet(name, punctuation) {
  const mark = punctuation || "!";
  console.log(\`Hello, \${name}\${mark}\`);
  return true;
}

module.exports = { greet };
`;
