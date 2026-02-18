import { useState, useEffect, useCallback } from 'react';

export const useSpeech = () => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [rate, setRate] = useState(1); // 1 is normal speed
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 检查浏览器是否支持 Web Speech API
  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      setIsSupported(false);
      setError('你的浏览器不支持语音朗读功能，请使用 Chrome、Edge 或 Safari 浏览器。');
      console.error('Web Speech API not supported');
      return;
    }

    const updateVoices = () => {
      try {
        const availableVoices = window.speechSynthesis.getVoices();
        console.log('Available voices:', availableVoices.length);

        // Filter for English voices
        const englishVoices = availableVoices.filter(v => v.lang.startsWith('en'));
        setVoices(englishVoices);

        if (englishVoices.length === 0) {
          setError('未找到英文语音包，请检查系统设置或尝试其他浏览器。');
          console.warn('No English voices found');
        } else {
          setError(null);
        }

        // Default to a decent voice if possible
        if (!selectedVoice && englishVoices.length > 0) {
          const preferred =
            englishVoices.find(v => v.name.includes('Google US English')) ||
            englishVoices.find(v => v.name.includes('Microsoft') && v.lang === 'en-US') ||
            englishVoices.find(v => v.name.includes('US')) ||
            englishVoices.find(v => v.lang === 'en-US') ||
            englishVoices[0];
          setSelectedVoice(preferred);
          console.log('Selected voice:', preferred?.name);
        }
      } catch (err) {
        console.error('Error loading voices:', err);
        setError('加载语音时出错，请刷新页面重试。');
      }
    };

    // 监听语音列表加载完成
    window.speechSynthesis.onvoiceschanged = updateVoices;

    // 立即尝试加载一次
    updateVoices();

    // 某些浏览器需要延迟加载
    const timer = setTimeout(updateVoices, 100);

    return () => {
      clearTimeout(timer);
      window.speechSynthesis.cancel();
    };
  }, [selectedVoice]);

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!text) return;

    if (!isSupported) {
      alert('你的浏览器不支持语音朗读功能，请使用 Chrome、Edge 或 Safari 浏览器。');
      return;
    }

    if (voices.length === 0) {
      alert('语音未加载完成，请稍后再试。');
      return;
    }

    try {
      // 停止之前的播放
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);

      // 设置语音
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      utterance.rate = rate;
      utterance.pitch = 1;
      utterance.volume = 1;

      // 设置语言（确保使用英文）
      utterance.lang = selectedVoice?.lang || 'en-US';

      utterance.onstart = () => {
        setIsPlaying(true);
        console.log('Speech started');
      };

      utterance.onend = () => {
        setIsPlaying(false);
        console.log('Speech ended');
        if (onEnd) onEnd();
      };

      utterance.onerror = (e) => {
        // 忽略手动停止导致的 interrupted 错误
        if (e.error === 'interrupted' || e.error === 'canceled') {
          setIsPlaying(false);
          return;
        }

        console.error("Speech error:", e);
        setIsPlaying(false);

        // 根据错误类型给出提示
        if (e.error === 'not-allowed') {
          alert('浏览器阻止了语音播放。请检查浏览器设置，允许此网站播放声音。');
        } else if (e.error === 'network') {
          alert('网络错误，无法加载语音。请检查网络连接。');
        } else {
          alert(`语音播放出错：${e.error}。请刷新页面重试。`);
        }
      };

      // 播放语音
      window.speechSynthesis.speak(utterance);

      // 解决某些浏览器的播放问题
      // Chrome 有时需要强制 resume
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

    } catch (err) {
      console.error('Error in speak function:', err);
      setIsPlaying(false);
      alert('播放语音时出错，请刷新页面重试。');
    }
  }, [selectedVoice, rate, isSupported, voices.length]);

  const cancel = useCallback(() => {
    try {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    } catch (err) {
      console.error('Error canceling speech:', err);
    }
  }, []);

  return {
    voices,
    selectedVoice,
    setSelectedVoice,
    rate,
    setRate,
    speak,
    cancel,
    isPlaying,
    isSupported,
    error
  };
};
