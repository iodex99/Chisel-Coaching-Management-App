const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigit(n: number): string {
  if (n < 20) return ONES[n]
  return (TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '')).trim()
}

function inWords(n: number): string {
  if (n === 0) return 'Zero'
  let str = ''
  const crore = Math.floor(n / 10000000)
  n %= 10000000
  const lakh = Math.floor(n / 100000)
  n %= 100000
  const thousand = Math.floor(n / 1000)
  n %= 1000
  const hundred = Math.floor(n / 100)
  n %= 100
  if (crore) str += inWords(crore) + ' Crore '
  if (lakh) str += twoDigit(lakh) + ' Lakh '
  if (thousand) str += twoDigit(thousand) + ' Thousand '
  if (hundred) str += ONES[hundred] + ' Hundred '
  if (n) str += (str ? 'and ' : '') + twoDigit(n) + ' '
  return str.trim()
}

/** Indian-system rupees-in-words from integer paise (for receipts). */
export function rupeesInWords(paise: number): string {
  const rupees = Math.floor(paise / 100)
  const p = paise % 100
  let s = `${inWords(rupees)} Rupee${rupees === 1 ? '' : 's'}`
  if (p) s += ` and ${twoDigit(p)} Paise`
  return s + ' Only'
}
