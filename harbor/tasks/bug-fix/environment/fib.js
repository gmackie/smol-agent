function fibonacci(n) {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  let a = 0, b = 1;
  for (let i = 2; i < n; i++) {  // BUG: should be i <= n
    const temp = a + b;
    a = b;
    b = temp;
  }
  return b;
}

// fibonacci(6) should return 8, but currently returns 5
console.log("fib(6) =", fibonacci(6));

module.exports = { fibonacci };
