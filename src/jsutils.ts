export function isPromiseLike<T>(val: any): val is PromiseLike<T> {
  return val && typeof val === "object" && typeof val.then === "function";
}
