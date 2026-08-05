import { services } from '../config/services';
import { serviceProxy } from '../utils/proxyFactory';

// notification service proxy: /v1/notify/* -> notification /v1/*
export const notificationProxy = serviceProxy('notification', services.notification, '/v1/notify');
