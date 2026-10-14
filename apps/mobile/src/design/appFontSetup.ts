import {installAppFont} from './appFont';

// A module of its own so index.js can run it before App's imports capture Text.
installAppFont();
