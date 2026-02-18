// 大语言模型API集成

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'custom';
  apiKey: string;
  model: string;
  baseURL?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// 获取保存的API配置
export const getStoredConfig = (): LLMConfig | null => {
  const stored = localStorage.getItem('llm_config');
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
};

// 保存API配置
export const saveConfig = (config: LLMConfig): void => {
  localStorage.setItem('llm_config', JSON.stringify(config));
};

// 清除API配置
export const clearConfig = (): void => {
  localStorage.removeItem('llm_config');
};

// 调用OpenAI API
async function callOpenAI(config: LLMConfig, messages: ChatMessage[]): Promise<string> {
  const baseURL = config.baseURL || 'https://api.openai.com/v1';
  
  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model || 'gpt-3.5-turbo',
      messages: messages,
      temperature: 0.7,
      max_tokens: 1000
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API Error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// 调用Anthropic API (Claude)
async function callAnthropic(config: LLMConfig, messages: ChatMessage[]): Promise<string> {
  const baseURL = config.baseURL || 'https://api.anthropic.com/v1';
  
  // 转换消息格式（Anthropic的格式稍有不同）
  const systemMessage = messages.find(m => m.role === 'system')?.content || '';
  const userMessages = messages.filter(m => m.role !== 'system');
  
  const response = await fetch(`${baseURL}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: config.model || 'claude-3-sonnet-20240229',
      max_tokens: 1000,
      system: systemMessage,
      messages: userMessages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }))
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API Error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// 调用自定义API
async function callCustomAPI(config: LLMConfig, messages: ChatMessage[]): Promise<string> {
  if (!config.baseURL) {
    throw new Error('自定义API需要提供baseURL');
  }

  const response = await fetch(config.baseURL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Custom API Error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  // 尝试标准的响应格式
  return data.choices?.[0]?.message?.content || data.content || data.response || JSON.stringify(data);
}

// 统一的聊天接口
export async function chat(messages: ChatMessage[]): Promise<string> {
  const config = getStoredConfig();
  
  if (!config) {
    throw new Error('请先配置大语言模型API');
  }

  if (!config.apiKey) {
    throw new Error('API Key不能为空');
  }

  try {
    switch (config.provider) {
      case 'openai':
        return await callOpenAI(config, messages);
      case 'anthropic':
        return await callAnthropic(config, messages);
      case 'custom':
        return await callCustomAPI(config, messages);
      default:
        throw new Error(`不支持的提供商: ${config.provider}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('调用大语言模型失败');
  }
}

// 生成关于听力材料的系统提示
export function generateSystemPrompt(fullText: string): string {
  return `你是一位专业的英语教师，正在帮助学生学习以下英语听力材料：

"""
${fullText}
"""

请根据这篇材料回答学生的问题。你可以：
1. 解释其中的生词、短语和句型
2. 分析语法结构
3. 讲解文化背景
4. 提供相关的学习建议
5. 解答任何与这篇材料相关的问题

请用简洁、易懂的中文回答，必要时举例说明。`;
}

