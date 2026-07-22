export const isStrictNever = (value: never) => {
  throw new Error(`Unhandled value in isStrictNever: ${value}`);
};
