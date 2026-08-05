import { services } from '../config/services';
import { serviceProxy } from '../utils/proxyFactory';

// core service proxy: /v1/core/* -> core /v1/*
export const coreProxy = serviceProxy('core', services.core, '/v1/core');
