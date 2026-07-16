function debounce(fn, delay) {
  let timer = null
  if (timer) clearTimeout(timer)
  setTimeout(() => {
    fn.apply(this, args)
  }, delay)
}
