import { services } from '../config/services';
import { serviceProxy } from '../utils/proxyFactory';

// authorization service proxy: /v1/platform/* -> authorization /v1/*
export const authorizationProxy = serviceProxy('authorization', services.authorization, '/v1/platform');
