import 'react-native-gesture-handler';
import {AppRegistry} from 'react-native';
import Config from 'react-native-config';
import {installGlobalErrorObservation} from './src/core/observability/globalErrorObservation';
import {name as appName} from './app.json';

installGlobalErrorObservation();
// One JS bundle, two Android apps: the rider flavor sets CRAVES_APP=rider; iOS has no flavor and stays customer.
AppRegistry.registerComponent(appName, () =>
  Config.CRAVES_APP === 'rider'
    ? require('./src/app/rider/RiderApp').RiderApp
    : require('./App').default,
);
