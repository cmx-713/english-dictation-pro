/**
 * 班级名称标准化工具
 * 
 * 标准化规则：
 * 1. 英文字母统一转大写（a -> A）
 * 2. 中文数字转阿拉伯数字（二 -> 2）
 * 3. 去除多余空格
 * 4. 统一全角/半角字符
 */

// 中文数字到阿拉伯数字的映射
const chineseToArabic: Record<string, string> = {
  '零': '0', '〇': '0',
  '一': '1', '壹': '1',
  '二': '2', '贰': '2',
  '三': '3', '叁': '3',
  '四': '4', '肆': '4',
  '五': '5', '伍': '5',
  '六': '6', '陆': '6',
  '七': '7', '柒': '7',
  '八': '8', '捌': '8',
  '九': '9', '玖': '9',
  '十': '10', '拾': '10',
};

/**
 * 标准化班级名称
 * @param className 原始班级名称
 * @returns 标准化后的班级名称
 * 
 * @example
 * normalizeClassName('a乙2') // 'A乙2'
 * normalizeClassName('A乙二') // 'A乙2'
 * normalizeClassName(' A 乙 2 ') // 'A乙2'
 * normalizeClassName('') // ''
 */
export function normalizeClassName(className: string): string {
  if (!className || typeof className !== 'string') {
    return '';
  }

  let normalized = className.trim();

  // 1. 英文字母转大写
  normalized = normalized.toUpperCase();

  // 2. 替换中文数字为阿拉伯数字
  // 先处理"十"的特殊情况（如：十一 -> 11, 二十 -> 20）
  normalized = normalized.replace(/([一二三四五六七八九])十([一二三四五六七八九])?/g, (_match, tens, ones) => {
    const tensValue = parseInt(chineseToArabic[tens] || '0');
    const onesValue = ones ? parseInt(chineseToArabic[ones] || '0') : 0;
    return String(tensValue * 10 + onesValue);
  });

  // 处理单独的"十"（10）
  normalized = normalized.replace(/^十$/g, '10');
  normalized = normalized.replace(/十$/g, '10');

  // 替换单个中文数字
  Object.entries(chineseToArabic).forEach(([chinese, arabic]) => {
    // 跳过已经处理过的"十"
    if (chinese === '十' || chinese === '拾') return;
    
    const regex = new RegExp(chinese, 'g');
    normalized = normalized.replace(regex, arabic);
  });

  // 3. 全角转半角
  normalized = normalized.replace(/[\uff01-\uff5e]/g, (char) => {
    return String.fromCharCode(char.charCodeAt(0) - 0xfee0);
  });

  // 4. 去除所有空格
  normalized = normalized.replace(/\s+/g, '');

  // 5. 去除末尾的"班"字（可选）
  // 例如：A甲2班 → A甲2
  normalized = normalized.replace(/班$/g, '');

  return normalized;
}

/**
 * 批量标准化班级名称（用于数据清洗）
 * @param classNames 班级名称数组
 * @returns 标准化后的班级名称数组（去重）
 */
export function batchNormalizeClassNames(classNames: string[]): string[] {
  const normalized = classNames
    .map(name => normalizeClassName(name))
    .filter(name => name !== '');
  
  // 去重
  return Array.from(new Set(normalized));
}

/**
 * 获取班级名称的映射表（用于显示哪些名称会被合并）
 * @param classNames 班级名称数组
 * @returns 原始名称 -> 标准名称的映射
 */
export function getClassNameMapping(classNames: string[]): Map<string, string> {
  const mapping = new Map<string, string>();
  
  classNames.forEach(original => {
    const normalized = normalizeClassName(original);
    if (normalized) {
      mapping.set(original, normalized);
    }
  });
  
  return mapping;
}
