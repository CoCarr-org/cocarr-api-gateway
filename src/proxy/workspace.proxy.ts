import { services } from '../config/services';
import { serviceProxy } from '../utils/proxyFactory';

// workspace service proxy: /v1/workspace/* -> workspace /v1/*
export const workspaceProxy = serviceProxy('workspace', services.workspace, '/v1/workspace');
