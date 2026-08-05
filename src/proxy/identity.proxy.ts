import { services } from '../config/services';
import { serviceProxy } from '../utils/proxyFactory';

// identity service proxy: /v1/auth/* -> identity /v1/*
export const identityProxy = serviceProxy('identity', services.identity, '/v1/auth');
