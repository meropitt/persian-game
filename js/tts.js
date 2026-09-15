// نطق الكلمات الفارسية باستخدام متصفح المستخدم (Web Speech API)
// ملاحظة: جودة النطق ومدى توفر صوت فارسي يعتمدان على المتصفح ونظام التشغيل.
export function speakFarsi(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "fa-IR";
  utter.rate = 0.85;
  const voices = window.speechSynthesis.getVoices();
  const faVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("fa"));
  if (faVoice) utter.voice = faVoice;
  window.speechSynthesis.speak(utter);
}
