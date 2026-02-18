import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Sparkles, User, Loader2, X, Settings, Key, AlertCircle, Save } from 'lucide-react';
import { ERROR_ANALYSIS_SYSTEM_PROMPT } from '../utils/aiPrompts';

// 默认配置
const DEFAULT_API_URL = "https://api.deepseek.com/v1/chat/completions";

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AIAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  context?: string;
  initialInput?: string;
  systemPrompt?: string;
}

export const AIAssistant: React.FC<AIAssistantProps> = ({ isOpen, onClose, context, initialInput, systemPrompt }) => {
  // 聊天记录
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: '你好！我是你的专属 AI 助教。请先配置 API Key 才能开始对话哦。' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- 配置相关状态 ---
  const [apiKey, setApiKey] = useState('');
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [showSettings, setShowSettings] = useState(false); // 是否显示设置面板

  // 初始化：从本地加载 Key
  useEffect(() => {
    const storedKey = localStorage.getItem('user_ai_api_key');
    const storedUrl = localStorage.getItem('user_ai_api_url');

    if (storedKey) {
      setApiKey(storedKey);
      setApiUrl(storedUrl || DEFAULT_API_URL);
      // 如果有 Key，不仅加载，还把欢迎语改正常
      setMessages([{ role: 'assistant', content: '你好！我是你的专属 AI 助教。练习过程中遇到生词或听不懂的句子，都可以问我哦！' }]);
    } else {
      // 没有 Key，强制显示设置页
      setShowSettings(true);
    }
  }, []);

  // 自动滚动
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, showSettings]);

  // 监听 initialInput 变化
  useEffect(() => {
    if (initialInput && isOpen) {
      setInput(initialInput);
    }
  }, [initialInput, isOpen]);

  // --- 保存配置 ---
  const handleSaveSettings = () => {
    if (!apiKey.trim()) {
      alert("请输入有效的 API Key");
      return;
    }
    localStorage.setItem('user_ai_api_key', apiKey.trim());
    localStorage.setItem('user_ai_api_url', apiUrl.trim() || DEFAULT_API_URL);

    setShowSettings(false);

    // 如果是第一次保存，更新欢迎语
    if (messages.length === 1 && messages[0].content.includes('配置 API Key')) {
      setMessages([{ role: 'assistant', content: '配置成功！现在你可以问我任何关于英语的问题了。' }]);
    }
  };

  // --- 发送消息 ---
  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    if (!apiKey) {
      setShowSettings(true);
      return;
    }

    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setIsLoading(true);

    try {
      let finalSystemPrompt = systemPrompt || ERROR_ANALYSIS_SYSTEM_PROMPT;
      if (context) {
        finalSystemPrompt += `\n\n【当前上下文】\n学生正在练习的完整原文如下：\n"${context}"\n\n请根据学生的提问，结合上述原文进行答疑或错误分析。如果学生询问具体句子的错误，请提取原文中对应的句子进行对比分析。`;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: finalSystemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: "user", content: userMsg }
          ],
          temperature: 0.7,
          stream: true
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || "API 请求失败");
      }

      if (!response.body) throw new Error("No response body");

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const json = JSON.parse(data);
              const content = json.choices[0]?.delta?.content || '';
              aiText += content;
              setMessages(prev => {
                const newMsgs = [...prev];
                const lastMsg = newMsgs[newMsgs.length - 1];
                if (lastMsg.role === 'assistant') lastMsg.content = aiText;
                return newMsgs;
              });
            } catch (e) { }
          }
        }
      }

    } catch (error: any) {
      console.error(error);
      let errMsg = "网络连接似乎出了点问题。";
      if (error.message.includes('401')) errMsg = "API Key 无效或已过期。";
      else if (error.message.includes('404')) errMsg = "API 地址不正确 (404)。";
      else if (error.message.includes('Failed to fetch')) errMsg = "无法连接相关服务，请检查网络或 API 地址。";

      setMessages(prev => [...prev, { role: 'assistant', content: `${errMsg} #CONFIG_ERROR#` }]);

      // 401 依然自动弹出，但其他错误也提供按钮
      if (error.message.includes('401')) setShowSettings(true);
    } finally {
      setIsLoading(false);
    }
  };

  const renderMessageContent = (text: string) => {
    // Check for config error marker
    const isConfigError = text.includes('#CONFIG_ERROR#');
    const displayText = text.replace(' #CONFIG_ERROR#', '');

    const lines = displayText.split('\n');
    const content = lines.map((line, i) => {
      if (!line.trim()) return <div key={i} className="h-2"></div>;
      const isList = line.trim().startsWith('* ') || line.trim().startsWith('- ');
      const cleanLine = isList ? line.trim().substring(2) : line;
      const parts = cleanLine.split(/(\*\*.*?\*\*)/g);
      const renderedLine = parts.map((part, idx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={idx} className="font-bold text-blue-700">{part.slice(2, -2)}</strong>;
        }
        return part;
      });
      if (isList) {
        return (
          <div key={i} className="flex items-start gap-2 mb-1 pl-1">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 shrink-0"></div>
            <span className="leading-relaxed text-slate-700">{renderedLine}</span>
          </div>
        );
      }
      return <p key={i} className={`mb-2 leading-relaxed ${isConfigError ? 'text-red-500 font-medium' : 'text-slate-700'}`}>{renderedLine}</p>;
    });

    if (isConfigError) {
      content.push(
        <button
          key="config-btn"
          onClick={() => setShowSettings(true)}
          className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold hover:bg-indigo-200 transition-colors w-fit"
        >
          <Settings size={14} />
          检查 API 配置
        </button>
      );
    }

    return content;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200 animation-slide-in-right">

      {/* Header */}
      <div className="p-4 bg-white border-b border-slate-100 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center">
            <Bot size={20} className="text-blue-600" />
          </div>
          <div>
            <span className="font-bold text-slate-800 block leading-tight">AI 助教</span>
            <span className="text-xs text-slate-500">
              {apiKey ? '已连接' : '未配置'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-blue-100 text-blue-600' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
            title="设置 API Key"
          >
            <Settings size={20} />
          </button>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* 主体区域：根据状态显示聊天或设置 */}
      {showSettings ? (
        <div className="flex-1 p-6 bg-slate-50/50 overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Key size={24} className="text-blue-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">配置 AI 服务</h3>
              <p className="text-sm text-slate-500 mt-1">请输入您的 API Key 以开始使用</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  API Key <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full p-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-mono text-sm"
                />
                <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                  <AlertCircle size={12} />
                  Key 仅存储在您的浏览器本地，不会上传。
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  API 地址 (Base URL)
                </label>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://api.deepseek.com/v1/chat/completions"
                  className="w-full p-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-mono text-sm text-slate-600 bg-slate-50"
                />
                <p className="text-xs text-slate-400 mt-1.5">
                  默认使用 DeepSeek，也可支持 OpenAI 等兼容接口。
                </p>
              </div>
            </div>

            <button
              onClick={handleSaveSettings}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2"
            >
              <Save size={18} />
              保存配置
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-5 bg-slate-50/30">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${msg.role === 'user' ? 'bg-slate-100 border-slate-200' : 'bg-slate-50 border-blue-100'
                }`}>
                {msg.role === 'user' ? <User size={16} className="text-slate-500" /> : <Sparkles size={16} className="text-blue-600" />}
              </div>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm border ${msg.role === 'user'
                ? 'bg-slate-100 text-slate-800 border-slate-200 rounded-tr-none'
                : 'bg-white text-slate-800 border-slate-200 rounded-tl-none'
                }`}>
                <div>{renderMessageContent(msg.content)}</div>
              </div>
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex items-center gap-2 text-slate-400 text-xs ml-12">
              <Loader2 size={14} className="animate-spin" />
              AI 正在思考...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* 输入区 (仅在非设置模式显示) */}
      {!showSettings && (
        <div className="p-4 bg-white border-t border-slate-100">
          <div className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder={apiKey ? "问问 AI..." : "请先配置 API Key"}
              disabled={!apiKey}
              className="w-full pl-4 pr-12 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 outline-none transition-all text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading || !apiKey}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:bg-slate-300"
            >
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};