const API_KEY = process.env.EXPO_PUBLIC_OPENWEATHERMAP_API_KEY || 'demo';
const BASE_URL = 'https://api.openweathermap.org/data/2.5';

export const weatherService = {
  // 現在の天気取得（降水量含む）
  getCurrentWeather: async (lat, lon) => {
    try {
      const response = await fetch(
        `${BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=ja`
      );
      const data = await response.json();
      
      // 降水量（mm/h）を取得
      const rainfall = data.rain?.['1h'] || 0;
      
      return {
        ...data,
        rainfall,
      };
    } catch (error) {
      console.error('Weather fetch error:', error);
      return null;
    }
  },
  
  // 予報取得
  getForecast: async (lat, lon) => {
    try {
      const response = await fetch(
        `${BASE_URL}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=ja`
      );
      return await response.json();
    } catch (error) {
      console.error('Forecast fetch error:', error);
      return null;
    }
  },
};
