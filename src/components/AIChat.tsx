import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Settings, Loader2, AlertCircle, CheckCircle, X } from 'lucide-react';
import { chat, ChatMessage, generateSystemPrompt, getStoredConfig, saveConfig, LLMConfig } from '../utils/llmApi';

interface AIChatProps {
  fullText: string;
}

export const AIChat: React.FC<AIChatProps> = ({ fullText }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<LLMConfig>(
    getStoredConfig() || {
      provider: 'openai',
      apiKey: '',
      model: 'gpt-3.5-turbo',
      baseURL: ''
    }
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 检查是否已配置API
  const isConfigured = config.apiKey !== '';

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    if (!isConfigured) {
      alert('请先配置大语言模型API');
      setShowConfig(true);
      return;
    }

    const userMessage: ChatMessage = {
      role: 'user',
      content: input.trim()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // 构建完整的消息历史
      const systemMessage: ChatMessage = {
        role: 'system',
        content: generateSystemPrompt(fullText)
      };

      const allMessages = [systemMessage, ...messages, userMessage];

      const response = await chat(allMessages);

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('AI Chat Error:', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `抱歉，发生了错误：${error instanceof Error ? error.message : '未知错误'}\n\n请检查API配置是否正确。`
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfig = () => {
    if (!config.apiKey) {
      alert('API Key不能为空');
      return;
    }
    saveConfig(config);
    setShowConfig(false);
    alert('API配置已保存');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* 配置面板 */}
      {showConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Settings size={24} className="text-primary" />
                  大语言模型API配置
                </h3>
                <button
                  onClick={() => setShowConfig(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-4">
                {/* API提供商 */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    API提供商
                  </label>
                  <select
                    value={config.provider}
                    onChange={(e) => setConfig({ ...config, provider: e.target.value as any })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  >
                    <option value="openai">OpenAI (GPT-3.5/GPT-4)</option>
                    <option value="anthropic">Anthropic (Claude)</option>
                    <option value="custom">自定义API</option>
                  </select>
                </div>

                {/* API Key */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    API Key *
                  </label>
                  <input
                    type="password"
                    value={config.apiKey}
                    onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                    placeholder="sk-..."
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>

                {/* 模型 */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    模型
                  </label>
                  <input
                    type="text"
                    value={config.model}
                    onChange={(e) => setConfig({ ...config, model: e.target.value })}
                    placeholder={
                      config.provider === 'openai' ? 'gpt-3.5-turbo' :
                      config.provider === 'anthropic' ? 'claude-3-sonnet-20240229' :
                      '模型名称'
                    }
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>

                {/* 自定义URL */}
                {config.provider === 'custom' && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      API Base URL *
                    </label>
                    <input
                      type="text"
                      value={config.baseURL || ''}
                      onChange={(e) => setConfig({ ...config, baseURL: e.target.value })}
                      placeholder="https://api.example.com/v1/chat"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                )}

                {/* 说明 */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                  <p className="font-semibold mb-2">💡 使用说明：</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>OpenAI：需要OpenAI账号和API Key</li>
                    <li>Anthropic：需要Anthropic账号和API Key</li>
                    <li>自定义：支持兼容OpenAI格式的API端点</li>
                    <li>API Key会安全保存在浏览器本地存储中</li>
                  </ul>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleSaveConfig}
                  className="flex-1 bg-primary text-white py-3 px-6 rounded-lg font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle size={20} />
                  保存配置
                </button>
                <button
                  onClick={() => setShowConfig(false)}
                  className="px-6 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 顶部工具栏 */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 rounded-t-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
              <Bot className="text-indigo-600" size={24} />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg">AI 学习助手</h3>
              <p className="text-indigo-100 text-xs">向我提问关于本篇听力材料的任何问题</p>
            </div>
          </div>
          <button
            onClick={() => setShowConfig(true)}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
            title="配置API"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {!isConfigured && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-6 text-center">
            <AlertCircle className="mx-auto text-yellow-600 mb-3" size={40} />
            <h4 className="font-bold text-yellow-800 mb-2">尚未配置API</h4>
            <p className="text-yellow-700 text-sm mb-4">
              请点击右上角的设置按钮配置大语言模型API，即可开始与AI助手对话
            </p>
            <button
              onClick={() => setShowConfig(true)}
              className="bg-yellow-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-yellow-700 transition-colors"
            >
              立即配置
            </button>
          </div>
        )}

        {messages.length === 0 && isConfigured && (
          <div className="text-center py-12 text-gray-500">
            <Bot size={48} className="mx-auto mb-4 opacity-30" />
            <p className="font-semibold mb-2">开始与AI助手对话</p>
            <p className="text-sm">你可以问：</p>
            <div className="mt-4 space-y-2">
              <div className="bg-white p-3 rounded-lg border border-gray-200 text-left max-w-md mx-auto">
                💬 "解释一下第三句中的 'contemporary' 是什么意思？"
              </div>
              <div className="bg-white p-3 rounded-lg border border-gray-200 text-left max-w-md mx-auto">
                💬 "这篇文章的主题是什么？"
              </div>
              <div className="bg-white p-3 rounded-lg border border-gray-200 text-left max-w-md mx-auto">
                💬 "分析一下第二段的语法结构"
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center shrink-0">
                <Bot className="text-white" size={18} />
              </div>
            )}
            <div
              className={`max-w-[80%] p-4 rounded-lg ${
                msg.role === 'user'
                  ? 'bg-primary text-white'
                  : 'bg-white border border-gray-200 text-gray-800'
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center shrink-0">
                <User className="text-white" size={18} />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center shrink-0">
              <Bot className="text-white" size={18} />
            </div>
            <div className="bg-white border border-gray-200 p-4 rounded-lg">
              <Loader2 className="animate-spin text-indigo-600" size={20} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <div className="p-4 bg-white border-t border-gray-200 rounded-b-xl">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isConfigured ? "输入你的问题..." : "请先配置API..."}
            disabled={!isConfigured || isLoading}
            className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none disabled:bg-gray-100"
            rows={2}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || !isConfigured || isLoading}
            className="bg-primary text-white px-6 py-2 rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <Send size={20} />
            发送
          </button>
        </div>
      </div>
    </div>
  );
};

