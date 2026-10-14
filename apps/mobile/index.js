import 'react-native-gesture-handler';
import './src/design/appFontSetup';
import {AppRegistry} from 'react-native';
import {installGlobalErrorObservation} from './src/core/observability/globalErrorObservation';
import App from './App';
import {name as appName} from './app.json';

installGlobalErrorObservation();
AppRegistry.registerComponent(appName, () => App);
