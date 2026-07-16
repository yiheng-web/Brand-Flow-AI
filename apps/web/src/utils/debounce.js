function debounce(fn, delay) {
  let timer = null
  if (timer) clearTimeout(timer)
  setTimeout(() => {
    fn.apply(this, args)
  }, delay)
}
function debounce2(fn, delay) {
  let timer = null
  if (timer) clearTimeout(timer)
  setTimeout(() => {
    fn.apply(this, args)
  }, delay)
}

function debounce3(fn, delay) {
  let timer = null
  if (timer) clearTimeout(timer)
  setTimeout(() => {
    fn.apply(this, args)
  }, delay)
}

function debounce6(fn, delay2) {
  let timer2 = null
  if (timer2) clearTimeout(timer)
  setTimeout((e) => {
    fn.apply(this, ...args)
  }, delay2)
}
