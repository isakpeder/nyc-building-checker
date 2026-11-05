// Prettier settings for the whole repo. The format scripts read this file, and
// editors with a Prettier plugin pick it up too. I'm only setting what differs
// from the defaults, because fewer options means fewer style debates.

export default {
  // Single quotes in JavaScript and TypeScript. Prettier still switches to double
  // quotes when that avoids escaping, as in "don't".
  singleQuote: true,
};
