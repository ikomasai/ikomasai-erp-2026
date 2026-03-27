// react-native-gesture-handlerはエントリーポイントの最上部でインポートが必要
// （Web含む全プラットフォームでジェスチャー機能を有効化するため）
import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';

import App from './App';
import { registerServiceWorker } from './src/shared/utils/serviceWorker';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
registerServiceWorker();
