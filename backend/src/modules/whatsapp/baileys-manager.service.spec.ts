// backend/src/modules/whatsapp/baileys-manager.service.spec.ts
import { Logger } from '@nestjs/common';
import {
  BaileysManagerService,
  BaileysInstance,
} from './baileys-manager.service';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import * as os from 'os';

// ── Minimal mock baileysFns ──────────────────────────────────────────────────

const noopSocket = {
  ev: {
    on: jest.fn(),
    removeAllListeners: jest.fn(),
  },
  end: jest.fn().mockResolvedValue(undefined),
  user: null,
};

const mockBaileysFns = {
  makeWASocket: jest.fn().mockReturnValue(noopSocket),
  useMultiFileAuthState: jest.fn().mockResolvedValue({
    state: {},
    saveCreds: jest.fn(),
  }),
  DisconnectReason: { loggedOut: 401 },
  downloadMediaMessage: jest.fn(),
  jidNormalizedUser: jest.fn((id: string) => id),
};

// ── Helpers ──────────────────────────────────────────────────────────────────

let tmpDir: string;

function makeManager(): BaileysManagerService {
  const manager = new BaileysManagerService();
  // Inject pre-resolved baileysFns and a temporary dataDir
  (manager as any).baileysFns = mockBaileysFns;
  (manager as any).dataDir = tmpDir;
  return manager;
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  tmpDir = join(os.tmpdir(), `baileys-manager-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  jest.clearAllMocks();
  // Suppress Logger output in tests
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BaileysManagerService', () => {
  it('getOrCreate creates a new instance', async () => {
    const manager = makeManager();
    const inst = await manager.getOrCreate('user-1');
    expect(inst).toBeInstanceOf(BaileysInstance);
    expect(manager.get('user-1')).toBe(inst);
  });

  it('getOrCreate returns same instance on second call (idempotent)', async () => {
    const manager = makeManager();
    const inst1 = await manager.getOrCreate('user-2');
    const inst2 = await manager.getOrCreate('user-2');
    expect(inst1).toBe(inst2);
  });

  it('get returns undefined for unknown userId', () => {
    const manager = makeManager();
    expect(manager.get('nonexistent')).toBeUndefined();
  });

  it('different userIds get different instances', async () => {
    const manager = makeManager();
    const instA = await manager.getOrCreate('user-a');
    const instB = await manager.getOrCreate('user-b');
    expect(instA).not.toBe(instB);
    expect(manager.get('user-a')).toBe(instA);
    expect(manager.get('user-b')).toBe(instB);
  });

  it('remove deletes instance from map', async () => {
    const manager = makeManager();
    await manager.getOrCreate('user-rm');
    expect(manager.get('user-rm')).toBeDefined();
    await manager.remove('user-rm');
    expect(manager.get('user-rm')).toBeUndefined();
  });
});
