// src/utils/textMatcher.ts

const numToWords: Record<string, string> = {
  '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four', 
  '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine',
  '10': 'ten', '11': 'eleven', '12': 'twelve', '13': 'thirteen', '14': 'fourteen',
  '15': 'fifteen', '16': 'sixteen', '17': 'seventeen', '18': 'eighteen', '19': 'nineteen',
  '20': 'twenty', '30': 'thirty', '40': 'forty', '50': 'fifty',
  '60': 'sixty', '70': 'seventy', '80': 'eighty', '90': 'ninety'
};

const normalizeNumbers = (text: string): string => {
  return text.replace(/\b\d+\b/g, (match) => {
    if (numToWords[match]) return numToWords[match];
    const num = parseInt(match);
    if (num > 20 && num < 100) {
      const tens = Math.floor(num / 10) * 10;
      const units = num % 10;
      if (numToWords[tens.toString()] && numToWords[units.toString()]) {
        return `${numToWords[tens.toString()]}-${numToWords[units.toString()]}`;
      }
    }
    return match;
  });
};

export const normalizeText = (text: string): string => {
  if (!text) return '';
  let normalized = text.toLowerCase();
  
  // 修改重点：在正则中添加了 \- (连字符)
  // 将标点符号替换为空格，这样 "fifteen-year-old" 就会变成 "fifteen year old"
  normalized = normalized.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'|]/g, " ");
  
  normalized = normalizeNumbers(normalized);
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
};

export const isSemanticallyCorrect = (input: string, original: string): boolean => {
  return normalizeText(input) === normalizeText(original);
};