/**
 * 班级名称标准化工具测试
 * 
 * 运行方式：
 * npm test -- classNameNormalizer.test.ts
 * 或
 * npx vitest classNameNormalizer.test.ts
 */

import { describe, it, expect } from 'vitest';
import { normalizeClassName, batchNormalizeClassNames, getClassNameMapping } from './classNameNormalizer';

describe('normalizeClassName', () => {
  describe('基本功能', () => {
    it('应该返回空字符串对于空输入', () => {
      expect(normalizeClassName('')).toBe('');
      expect(normalizeClassName(null as any)).toBe('');
      expect(normalizeClassName(undefined as any)).toBe('');
    });

    it('应该去除前后空格', () => {
      expect(normalizeClassName('  A乙2  ')).toBe('A乙2');
      expect(normalizeClassName(' A 乙 2 ')).toBe('A乙2');
    });
  });

  describe('英文字母大写转换', () => {
    it('应该将小写字母转为大写', () => {
      expect(normalizeClassName('a乙2')).toBe('A乙2');
      expect(normalizeClassName('abc甲1')).toBe('ABC甲1');
    });

    it('应该保持已经是大写的字母不变', () => {
      expect(normalizeClassName('A乙2')).toBe('A乙2');
      expect(normalizeClassName('ABC甲1')).toBe('ABC甲1');
    });

    it('应该处理混合大小写', () => {
      expect(normalizeClassName('AbC甲1')).toBe('ABC甲1');
    });
  });

  describe('中文数字转阿拉伯数字', () => {
    it('应该转换基本中文数字', () => {
      expect(normalizeClassName('A乙一')).toBe('A乙1');
      expect(normalizeClassName('A乙二')).toBe('A乙2');
      expect(normalizeClassName('A乙三')).toBe('A乙3');
      expect(normalizeClassName('A乙四')).toBe('A乙4');
      expect(normalizeClassName('A乙五')).toBe('A乙5');
      expect(normalizeClassName('A乙六')).toBe('A乙6');
      expect(normalizeClassName('A乙七')).toBe('A乙7');
      expect(normalizeClassName('A乙八')).toBe('A乙8');
      expect(normalizeClassName('A乙九')).toBe('A乙9');
    });

    it('应该转换繁体中文数字', () => {
      expect(normalizeClassName('A乙壹')).toBe('A乙1');
      expect(normalizeClassName('A乙贰')).toBe('A乙2');
      expect(normalizeClassName('A乙叁')).toBe('A乙3');
    });

    it('应该转换十位数', () => {
      expect(normalizeClassName('A甲十')).toBe('A甲10');
      expect(normalizeClassName('A甲一十一')).toBe('A甲11');
      expect(normalizeClassName('A甲二十')).toBe('A甲20');
      expect(normalizeClassName('A甲二十三')).toBe('A甲23');
    });

    it('应该转换零', () => {
      expect(normalizeClassName('A零班')).toBe('A0班');
      expect(normalizeClassName('A〇班')).toBe('A0班');
    });
  });

  describe('全角转半角', () => {
    it('应该转换全角英文字母', () => {
      expect(normalizeClassName('Ａ乙2')).toBe('A乙2');
      expect(normalizeClassName('ＡＢＣ甲1')).toBe('ABC甲1');
    });

    it('应该转换全角数字', () => {
      expect(normalizeClassName('A乙２')).toBe('A乙2');
      expect(normalizeClassName('A甲１２３')).toBe('A甲123');
    });

    it('应该同时转换全角字母和数字', () => {
      expect(normalizeClassName('Ａ乙２')).toBe('A乙2');
    });
  });

  describe('空格处理', () => {
    it('应该去除所有空格', () => {
      expect(normalizeClassName('A 乙 2')).toBe('A乙2');
      expect(normalizeClassName('A  乙  2')).toBe('A乙2');
    });
  });

  describe('"班"字处理', () => {
    it('应该去除末尾的"班"字', () => {
      expect(normalizeClassName('A甲2班')).toBe('A甲2');
      expect(normalizeClassName('A乙2班')).toBe('A乙2');
      expect(normalizeClassName('高一3班')).toBe('高13');
      expect(normalizeClassName('初二5班')).toBe('初25');
    });

    it('应该保留中间的"班"字', () => {
      // 如果"班"不在末尾，应该保留
      expect(normalizeClassName('班长A甲2')).toBe('班长A甲2');
    });

    it('应该处理"班"字与其他转换的组合', () => {
      expect(normalizeClassName('a乙2班')).toBe('A乙2');
      expect(normalizeClassName('A乙二班')).toBe('A乙2');
      expect(normalizeClassName(' A 乙 2 班 ')).toBe('A乙2');
      expect(normalizeClassName('Ａ乙２班')).toBe('A乙2');
    });
  });

  describe('综合测试 - 真实场景', () => {
    it('应该正确处理常见的班级名称变体', () => {
      // 这些应该都被标准化为 "A乙2"
      const variants = [
        'A乙2',
        'a乙2',
        'A乙二',
        'a乙二',
        ' A乙2 ',
        'A 乙 2',
        'Ａ乙２',
        'ａ乙２',
        'ａ乙二',
        'A乙2班',    // 带"班"字
        'a乙2班',    // 小写+班
        'A乙二班'    // 中文数字+班
      ];

      variants.forEach(variant => {
        expect(normalizeClassName(variant)).toBe('A乙2');
      });
    });

    it('应该正确处理其他班级格式', () => {
      expect(normalizeClassName('高一3班')).toBe('高13');
      expect(normalizeClassName('高一三班')).toBe('高13');
      expect(normalizeClassName('初二5班')).toBe('初25');
      expect(normalizeClassName('A甲1班')).toBe('A甲1');
      expect(normalizeClassName('A甲1')).toBe('A甲1');
      expect(normalizeClassName('B丙10班')).toBe('B丙10');
    });

    it('应该保持已经标准化的名称不变', () => {
      const normalized = 'A乙2';
      expect(normalizeClassName(normalized)).toBe(normalized);
    });
  });
});

describe('batchNormalizeClassNames', () => {
  it('应该批量标准化班级名称', () => {
    const input = ['a乙2', 'A乙二', 'b甲1', 'B甲一'];
    const output = batchNormalizeClassNames(input);
    
    expect(output).toContain('A乙2');
    expect(output).toContain('B甲1');
  });

  it('应该去重相同的标准化结果', () => {
    const input = ['a乙2', 'A乙2', 'A乙二'];
    const output = batchNormalizeClassNames(input);
    
    expect(output).toHaveLength(1);
    expect(output[0]).toBe('A乙2');
  });

  it('应该过滤空字符串', () => {
    const input = ['A乙2', '', '  ', 'B甲1'];
    const output = batchNormalizeClassNames(input);
    
    expect(output).toHaveLength(2);
    expect(output).not.toContain('');
  });
});

describe('getClassNameMapping', () => {
  it('应该创建正确的映射表', () => {
    const input = ['a乙2', 'A乙二', 'b甲1'];
    const mapping = getClassNameMapping(input);
    
    expect(mapping.get('a乙2')).toBe('A乙2');
    expect(mapping.get('A乙二')).toBe('A乙2');
    expect(mapping.get('b甲1')).toBe('B甲1');
  });

  it('应该显示哪些名称会被合并', () => {
    const input = ['a乙2', 'A乙2', 'A乙二'];
    const mapping = getClassNameMapping(input);
    
    // 所有这些都应该映射到 'A乙2'
    expect(mapping.get('a乙2')).toBe('A乙2');
    expect(mapping.get('A乙2')).toBe('A乙2');
    expect(mapping.get('A乙二')).toBe('A乙2');
  });

  it('应该跳过空字符串', () => {
    const input = ['A乙2', '', '  '];
    const mapping = getClassNameMapping(input);
    
    expect(mapping.size).toBe(1);
    expect(mapping.has('')).toBe(false);
  });
});
