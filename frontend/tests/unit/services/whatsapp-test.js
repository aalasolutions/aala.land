import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import Service from '@ember/service';
import { settled } from '@ember/test-helpers';

module('Unit | Service | whatsapp', function (hooks) {
  setupTest(hooks);

  test('signup calls hit the right paths and methods', async function (assert) {
    const calls = [];
    this.owner.register(
      'service:auth',
      class extends Service {
        token = 'test-token';
        fetchJson(path, options) {
          calls.push({ path, options });
          return Promise.resolve({ success: true, data: null });
        }
      },
    );

    const service = this.owner.lookup('service:whatsapp');
    await service.getSignupConfig();
    await service.connect({ code: 'c', wabaId: '1', phoneNumberId: '2' });
    await service.disconnect();

    assert.strictEqual(calls[0].path, '/whatsapp/signup-config');
    assert.strictEqual(calls[0].options, undefined);

    assert.strictEqual(calls[1].path, '/whatsapp/connect');
    assert.strictEqual(calls[1].options.method, 'POST');
    assert.deepEqual(JSON.parse(calls[1].options.body), {
      code: 'c',
      wabaId: '1',
      phoneNumberId: '2',
    });

    assert.strictEqual(calls[2].path, '/whatsapp/connection');
    assert.strictEqual(calls[2].options.method, 'DELETE');
  });

  test('getConnection reads /whatsapp/connection', async function (assert) {
    let capturedPath;
    this.owner.register(
      'service:auth',
      class extends Service {
        token = 'test-token';
        fetchJson(path) {
          capturedPath = path;
          return Promise.resolve({ success: true, data: null });
        }
      },
    );

    const service = this.owner.lookup('service:whatsapp');
    const result = await service.getConnection();

    assert.strictEqual(capturedPath, '/whatsapp/connection');
    assert.deepEqual(result, { success: true, data: null });
  });

  test('message reads build limit and before query strings', async function (assert) {
    const paths = [];
    this.owner.register(
      'service:auth',
      class extends Service {
        token = 'test-token';
        fetchJson(path) {
          paths.push(path);
          return Promise.resolve({ success: true, data: { messages: [] } });
        }
      },
    );

    const service = this.owner.lookup('service:whatsapp');
    await service.getMessages('971500000001@s.whatsapp.net');
    await service.getMessages('971500000001', { before: 'm 1', limit: 20 });
    await service.getMessages('971500000001', { after: 'm-2' });
    await service.getMessages('971500000001', { around: 'm-3', limit: 100 });

    assert.deepEqual(paths, [
      '/whatsapp/messages/971500000001%40s.whatsapp.net?limit=50',
      '/whatsapp/messages/971500000001?limit=20&before=m+1',
      '/whatsapp/messages/971500000001?limit=50&after=m-2',
      '/whatsapp/messages/971500000001?limit=100&around=m-3',
    ]);
    assert.strictEqual(
      service.getAllMessages,
      undefined,
      'cross-chat read gone',
    );
  });

  test('sendMessage posts chatId and body to /whatsapp/send', async function (assert) {
    let capturedPath;
    let capturedOptions;
    this.owner.register(
      'service:auth',
      class extends Service {
        token = 'test-token';
        fetchJson(path, options) {
          capturedPath = path;
          capturedOptions = options;
          return Promise.resolve({ success: true, data: { id: 'm1' } });
        }
      },
    );

    const service = this.owner.lookup('service:whatsapp');
    const result = await service.sendMessage('123@c.us', 'hello');

    assert.strictEqual(capturedPath, '/whatsapp/send');
    assert.strictEqual(capturedOptions.method, 'POST');
    assert.deepEqual(JSON.parse(capturedOptions.body), {
      chatId: '123@c.us',
      body: 'hello',
    });
    assert.deepEqual(result, { success: true, data: { id: 'm1' } });
  });

  test('on/off fans events out to every listener of that type only', function (assert) {
    const service = this.owner.lookup('service:whatsapp');
    const seen = [];
    const a = (d) => seen.push(['a', d]);
    const b = (d) => seen.push(['b', d]);
    const ai = (d) => seen.push(['ai', d]);

    service.on('message', a);
    service.on('message', b);
    service.on('ai', ai);
    service._emit('message', 1);
    assert.deepEqual(seen, [
      ['a', 1],
      ['b', 1],
    ]);

    service.off('message', a);
    service._emit('message', 2);
    assert.deepEqual(seen.slice(2), [['b', 2]], 'removed listener is silent');
  });

  function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  module('resync', function (nested) {
    nested.beforeEach(function () {
      this.service = this.owner.lookup('service:whatsapp');
      this.fetches = [];
      this.service.getChats = () => {
        const d = deferred();
        this.fetches.push(d);
        return d.promise;
      };
      this.chats = { data: { chats: [{ chatId: 'c-1' }] } };
      this.emittedChats = [];
      this.service.on('chats', (chats) => this.emittedChats.push(chats));
    });

    test('an unrecovered ready fetches chats only and emits chats once', async function (assert) {
      const paths = [];
      this.service.auth = { fetchJson: (path) => paths.push(path) };
      this.service._onReady({ recovered: false });
      assert.strictEqual(this.fetches.length, 1);
      assert.deepEqual(paths, [], 'no messages read');

      this.fetches[0].resolve(this.chats);
      await settled();
      assert.deepEqual(this.emittedChats, [[{ chatId: 'c-1' }]]);
    });

    test('a resync replaces the unread map instead of merging', async function (assert) {
      this.service.unread = new Map([
        ['c-old', { unreadCount: 5, lastReadMessageId: null, chatName: null }],
      ]);
      this.service._onReady({ recovered: false });
      this.fetches[0].resolve({
        data: { chats: [{ chatId: 'c-1', unreadCount: 2 }] },
      });
      await settled();

      assert.deepEqual([...this.service.unread.keys()], ['c-1']);
      assert.strictEqual(this.service.totalUnread, 2);
    });

    test('a ready during a resync queues exactly one more after it finishes', async function (assert) {
      this.service._onReady({ recovered: false });
      this.service._onReady({ recovered: false });
      this.service._onReady({ recovered: false });
      assert.strictEqual(this.fetches.length, 1, 'no concurrent fetch');

      this.fetches[0].resolve(this.chats);
      await settled();
      assert.strictEqual(this.fetches.length, 2, 'one queued resync ran');

      this.fetches[1].resolve(this.chats);
      await settled();
      assert.strictEqual(this.fetches.length, 2, 'nothing more queued');
      assert.false(this.service._resyncInFlight);
    });

    test('a disconnect clears the queued resync', async function (assert) {
      this.service._onReady({ recovered: false });
      this.service._onReady({ recovered: false });
      this.service.disconnectSocket();
      this.fetches[0].resolve(this.chats);
      await settled();

      assert.strictEqual(this.fetches.length, 1);
      assert.deepEqual(this.emittedChats, []);
    });

    test('a completed history sync emits history and refetches chats', async function (assert) {
      const emitted = [];
      this.service.on('history', (data) => emitted.push(data));

      this.service._onHistory({ status: 'complete', progress: 100 });
      assert.deepEqual(emitted, [{ status: 'complete', progress: 100 }]);
      assert.strictEqual(this.fetches.length, 1);

      this.fetches[0].resolve(this.chats);
      await settled();
      assert.deepEqual(this.emittedChats, [[{ chatId: 'c-1' }]]);
    });

    test('history progress below complete does not refetch chats', function (assert) {
      this.service._onHistory({ status: 'in_progress', progress: 40 });
      assert.strictEqual(this.fetches.length, 0);
    });

    test('the first ready with no payload also resyncs', function (assert) {
      this.service._onReady(undefined);
      assert.strictEqual(this.fetches.length, 1);
    });

    test('a recovered ready does nothing', async function (assert) {
      this.service._onReady({ recovered: true });
      await settled();
      assert.strictEqual(this.fetches.length, 0);
      assert.deepEqual(this.emittedChats, []);
    });

    test('a result arriving after disconnectSocket is ignored', async function (assert) {
      this.service._onReady({ recovered: false });
      this.service.disconnectSocket();
      this.fetches[0].resolve(this.chats);
      await settled();

      assert.deepEqual(this.emittedChats, []);
      this.service._onReady({ recovered: false });
      assert.strictEqual(this.fetches.length, 2, 'a new socket can resync');
    });

    test('a failed resync is logged, never thrown', async function (assert) {
      const failure = new Error('network down');
      const originalError = console.error;
      let logged;
      console.error = (...args) => (logged = args);
      try {
        this.service._onReady({ recovered: false });
        this.fetches[0].reject(failure);
        await settled();
      } finally {
        console.error = originalError;
      }

      assert.strictEqual(logged?.[1], failure);
      assert.deepEqual(this.emittedChats, []);
      assert.false(this.service._resyncInFlight);
    });
  });

  test('the last chat is stored per user and survives bad storage', function (assert) {
    const service = this.owner.lookup('service:whatsapp');
    service.auth = { currentUser: { id: 'u-9' } };
    const entry = {
      chatId: 'c-1',
      anchorMessageId: 'm-4',
      anchorOffset: 12,
      atBottom: false,
    };
    service.saveLastChat(entry);
    assert.deepEqual(
      JSON.parse(localStorage.getItem('wa:lastChat:u-9')),
      entry,
    );
    assert.deepEqual(service.readLastChat(), entry);

    localStorage.setItem('wa:lastChat:u-9', '{not json');
    assert.strictEqual(service.readLastChat(), null, 'corrupt value ignored');
    service.clearLastChat();
    assert.strictEqual(localStorage.getItem('wa:lastChat:u-9'), null);

    service.auth = { currentUser: null };
    service.saveLastChat(entry);
    assert.strictEqual(service.readLastChat(), null, 'no user, no key');
  });

  test('disconnectSocket releases the socket', function (assert) {
    const service = this.owner.lookup('service:whatsapp');
    let disconnected = 0;
    service._socket = { disconnect: () => disconnected++ };
    service.disconnectSocket();

    assert.strictEqual(disconnected, 1);
    assert.strictEqual(service._socket, null);
  });

  test('after disconnectSocket no last chat save writes until the next connectSocket', function (assert) {
    const service = this.owner.lookup('service:whatsapp');
    service.auth = { currentUser: { id: 'u-7' } };
    service._openSocket = () => ({ active: true, on() {}, disconnect() {} });
    const entry = { chatId: 'c-1', atBottom: true };

    service.disconnectSocket();
    service.saveLastChat(entry);
    assert.strictEqual(localStorage.getItem('wa:lastChat:u-7'), null);

    service.connectSocket();
    service.saveLastChat(entry);
    assert.deepEqual(service.readLastChat(), entry);

    service.disconnectSocket();
  });

  function fakeSocket() {
    return {
      active: true,
      connected: true,
      events: [],
      handlers: {},
      emits: [],
      disconnects: 0,
      on(event, fn) {
        this.events.push(event);
        this.handlers[event] = fn;
      },
      emit(event, payload, ack) {
        this.emits.push({ event, payload, ack });
      },
      fire(event, ...args) {
        this.handlers[event](...args);
      },
      disconnect() {
        this.disconnects++;
        this.active = false;
      },
    };
  }

  test('connectSocket opens one socket, wires every event, and reuses a live socket', function (assert) {
    const service = this.owner.lookup('service:whatsapp');
    const opened = [];
    service._openSocket = () => {
      const socket = fakeSocket();
      opened.push(socket);
      return socket;
    };

    const first = service.connectSocket();
    const second = service.connectSocket();

    assert.strictEqual(opened.length, 1, 'a live socket is reused');
    assert.strictEqual(first, second);
    assert.deepEqual([...first.events].sort(), [
      'connect',
      'connect_error',
      'disconnect',
      'whatsapp:ai',
      'whatsapp:history',
      'whatsapp:message',
      'whatsapp:ready',
      'whatsapp:status',
      'whatsapp:unread',
    ]);
  });

  test('connectSocket replaces a socket the server closed', function (assert) {
    const service = this.owner.lookup('service:whatsapp');
    const opened = [];
    service._openSocket = () => {
      const socket = fakeSocket();
      opened.push(socket);
      return socket;
    };

    const dead = service.connectSocket();
    dead.active = false;

    const fresh = service.connectSocket();

    assert.strictEqual(opened.length, 2, 'a new socket is opened');
    assert.notStrictEqual(fresh, dead);
    assert.strictEqual(dead.disconnects, 1, 'the dead socket is released');
  });
  module('self reopen', function (nested) {
    nested.beforeEach(function () {
      this.service = this.owner.lookup('service:whatsapp');
      this.service.getChats = () => Promise.resolve({ data: {} });
      this.opened = [];
      this.scheduled = [];
      this.service._openSocket = () => {
        const socket = fakeSocket();
        this.opened.push(socket);
        return socket;
      };
      this.service._later = (fn, ms) => {
        this.scheduled.push({ fn, ms });
        return this.scheduled.length;
      };
      this.serverClose = (socket) => {
        socket.active = false;
        socket.fire('disconnect', 'io server disconnect');
      };
    });

    test('a server close while wanted schedules one reopen that opens a new socket', function (assert) {
      const first = this.service.connectSocket();
      this.serverClose(first);

      assert.strictEqual(this.scheduled.length, 1);
      assert.strictEqual(this.scheduled[0].ms, 2000);

      this.scheduled[0].fn();
      assert.strictEqual(this.opened.length, 2, 'a new socket is opened');
      assert.strictEqual(this.service._socket, this.opened[1]);
      assert.strictEqual(this.service._reopenTimer, null);
    });

    test('a middleware rejection (socket inactive) schedules a reopen', function (assert) {
      const socket = this.service.connectSocket();
      socket.active = false;
      socket.fire('connect_error', new Error('unauthorized'));

      assert.strictEqual(this.scheduled.length, 1);
    });

    test('a transport drop the client retries itself schedules nothing', function (assert) {
      const socket = this.service.connectSocket();
      socket.fire('disconnect', 'transport close');
      socket.fire('connect_error', new Error('xhr poll error'));

      assert.true(socket.active);
      assert.strictEqual(this.scheduled.length, 0);
    });

    test('repeated failures back off and cap at 60s', function (assert) {
      this.service.connectSocket();
      for (let i = 0; i < 6; i++) {
        this.serverClose(this.service._socket);
        this.scheduled[i].fn();
      }

      assert.deepEqual(
        this.scheduled.map((s) => s.ms),
        [2000, 5000, 15000, 30000, 60000, 60000],
      );
    });

    test('a successful ready resets the backoff', function (assert) {
      this.service.connectSocket();
      this.serverClose(this.service._socket);
      this.scheduled[0].fn();
      this.serverClose(this.service._socket);
      this.scheduled[1].fn();

      this.service._socket.fire('whatsapp:ready', { recovered: false });
      this.serverClose(this.service._socket);

      assert.deepEqual(
        this.scheduled.map((s) => s.ms),
        [2000, 5000, 2000],
      );
    });

    test('never schedules twice, and ignores events from a replaced socket', function (assert) {
      const first = this.service.connectSocket();
      this.serverClose(first);
      first.fire('disconnect', 'io server disconnect');
      first.fire('connect_error', new Error('unauthorized'));
      assert.strictEqual(this.scheduled.length, 1, 'one pending reopen');

      this.scheduled[0].fn();
      first.fire('disconnect', 'io server disconnect');
      assert.strictEqual(this.scheduled.length, 1, 'stale socket is ignored');
    });

    test('a server close after disconnectSocket schedules nothing', function (assert) {
      const socket = this.service.connectSocket();
      this.service.disconnectSocket();
      socket.fire('disconnect', 'io server disconnect');

      assert.strictEqual(this.scheduled.length, 0);
    });
  });

  test('disconnectSocket cancels a pending lifeline reopen', async function (assert) {
    const service = this.owner.lookup('service:whatsapp');
    const opened = [];
    service._openSocket = () => {
      const socket = fakeSocket();
      opened.push(socket);
      return socket;
    };

    const socket = service.connectSocket();
    socket.active = false;
    socket.fire('disconnect', 'io server disconnect');
    assert.notStrictEqual(
      service._reopenTimer,
      null,
      'a real timer is pending',
    );

    service.disconnectSocket();
    assert.strictEqual(service._reopenTimer, null);

    await settled();
    assert.strictEqual(opened.length, 1, 'the cancelled reopen never ran');
  });

  module('unread', function (nested) {
    nested.beforeEach(function () {
      this.toasts = [];
      this.removed = [];
      const ctx = this;
      this.owner.register(
        'service:notifications',
        class extends Service {
          success(message, duration) {
            ctx.toasts.push({ message, duration });
            return ctx.toasts.length;
          }
          remove(id) {
            ctx.removed.push(id);
          }
        },
      );
      this.service = this.owner.lookup('service:whatsapp');
      this.service.getChats = () =>
        Promise.resolve({
          data: {
            chats: [
              {
                chatId: 'c-1',
                chatName: 'Layla',
                unreadCount: 2,
                lastReadMessageId: 'm-1',
              },
              { chatId: 'c-2', chatName: 'Omar', unreadCount: 1 },
            ],
          },
        });
      this.scheduled = [];
      this.service._later = (fn, ms) => {
        this.scheduled.push({ fn, ms });
        return this.scheduled.length;
      };
      this.socket = fakeSocket();
      this.service._openSocket = () => this.socket;
      this.service.connectSocket();
    });

    test('a resync seeds the map and whatsapp:unread updates it', async function (assert) {
      this.socket.fire('whatsapp:ready', { recovered: false });
      await settled();

      assert.deepEqual(this.service.unread.get('c-1'), {
        unreadCount: 2,
        lastReadMessageId: 'm-1',
        chatName: 'Layla',
      });
      assert.strictEqual(this.service.totalUnread, 3);

      this.socket.fire('whatsapp:unread', {
        chatId: 'c-1',
        unreadCount: 0,
        lastReadMessageId: 'm-9',
      });
      assert.deepEqual(this.service.unread.get('c-1'), {
        unreadCount: 0,
        lastReadMessageId: 'm-9',
        chatName: 'Layla',
      });
      assert.strictEqual(this.service.totalUnread, 1);
    });

    test('markRead sends once, keeps the newest marker, and flushes it after a second', function (assert) {
      this.service.markRead('c-1', 'm-2');
      this.service.markRead('c-1', 'm-3');
      this.service.markRead('c-1', 'm-4');

      assert.strictEqual(this.socket.emits.length, 1);
      assert.deepEqual(this.socket.emits[0].payload, {
        chatId: 'c-1',
        messageId: 'm-2',
      });
      assert.strictEqual(this.scheduled[0].ms, 1000);

      this.scheduled[0].fn();
      assert.strictEqual(this.socket.emits.length, 2);
      assert.deepEqual(this.socket.emits[1].payload, {
        chatId: 'c-1',
        messageId: 'm-4',
      });

      this.socket.emits[1].ack({
        chatId: 'c-1',
        unreadCount: 0,
        lastReadMessageId: 'm-4',
      });
      assert.strictEqual(
        this.service.unread.get('c-1').lastReadMessageId,
        'm-4',
      );

      this.scheduled[1].fn();
      assert.strictEqual(this.socket.emits.length, 2, 'nothing pending');
    });

    test('an error ack is logged and leaves the map alone', function (assert) {
      const originalError = console.error;
      let logged;
      console.error = (...args) => (logged = args);
      try {
        this.service.markRead('c-1', 'm-2');
        this.socket.emits[0].ack({ error: 'nope' });
      } finally {
        console.error = originalError;
      }

      assert.deepEqual(logged?.[1], { error: 'nope' });
      assert.false(this.service.unread.has('c-1'));
    });

    test('a marker set while offline is sent after the next ready', function (assert) {
      this.socket.connected = false;
      this.service.markRead('c-1', 'm-2');
      assert.strictEqual(this.socket.emits.length, 0);

      this.socket.connected = true;
      this.socket.fire('whatsapp:ready', { recovered: true });
      assert.deepEqual(this.socket.emits[0].payload, {
        chatId: 'c-1',
        messageId: 'm-2',
      });
    });

    test('an inbound message toasts only for a chat that is not open, one toast per chat', function (assert) {
      const inbound = (id, chatId, extra = {}) =>
        this.socket.fire('whatsapp:message', {
          id,
          chatId,
          chatName: 'Layla',
          body: 'hi',
          fromMe: false,
          ...extra,
        });

      this.service.activeChatId = 'c-open';
      inbound('m-1', 'c-open');
      inbound('m-2', 'c-1', { fromMe: true });
      assert.strictEqual(this.toasts.length, 0, 'open chat and outbound');

      inbound('m-3', 'c-1');
      assert.deepEqual(this.toasts, [
        { message: 'New WhatsApp message from Layla', duration: 0 },
      ]);

      inbound('m-4', 'c-1');
      assert.strictEqual(this.toasts.length, 2);
      assert.deepEqual(this.removed, [1], 'older toast replaced');
    });

    test('a resync never toasts', async function (assert) {
      this.socket.fire('whatsapp:ready', { recovered: false });
      await settled();

      assert.strictEqual(this.toasts.length, 0);
    });

    test('the same marker is never sent twice, but a failed one can retry', function (assert) {
      const originalError = console.error;
      console.error = () => {};
      try {
        this.service.markRead('c-1', 'm-2');
        this.scheduled[0].fn();
        this.service.markRead('c-1', 'm-2');
        assert.strictEqual(this.socket.emits.length, 1, 'not resent');

        this.socket.emits[0].ack({ error: 'nope' });
        this.service.markRead('c-1', 'm-2');
        assert.strictEqual(this.socket.emits.length, 2, 'retried after error');
      } finally {
        console.error = originalError;
      }
    });

    test('a marker unacked when the socket dropped is resent after reconnect; an acked one is not', function (assert) {
      this.service.markRead('c-1', 'm-2');
      this.socket.emits[0].ack({
        chatId: 'c-1',
        unreadCount: 0,
        lastReadMessageId: 'm-2',
      });
      this.service.markRead('c-2', 'm-7');
      this.scheduled[0].fn();
      this.scheduled[1].fn();
      assert.strictEqual(this.socket.emits.length, 2);

      this.socket.connected = false;
      this.socket.fire('disconnect', 'transport close');
      this.socket.connected = true;
      this.socket.fire('connect');
      this.socket.fire('whatsapp:ready', { recovered: true });

      assert.strictEqual(this.socket.emits.length, 3, 'one resend');
      assert.deepEqual(this.socket.emits[2].payload, {
        chatId: 'c-2',
        messageId: 'm-7',
      });

      this.service.markRead('c-1', 'm-2');
      assert.strictEqual(
        this.socket.emits.length,
        3,
        'acked marker not resent',
      );
    });

    test('logout clears unread, toasts and the saved chat; a self reopen keeps them', async function (assert) {
      this.service.auth = { currentUser: { id: 'u-1' } };
      this.service.saveLastChat({ chatId: 'c-1', atBottom: true });
      this.socket.fire('whatsapp:ready', { recovered: false });
      await settled();
      this.socket.fire('whatsapp:message', {
        id: 'm-3',
        chatId: 'c-2',
        body: 'hi',
        fromMe: false,
      });
      assert.strictEqual(this.toasts.length, 1);

      this.socket.active = false;
      this.socket.fire('disconnect', 'io server disconnect');
      this.scheduled.at(-1).fn();
      assert.strictEqual(this.service.totalUnread, 3, 'reopen keeps unread');
      assert.deepEqual(this.removed, [], 'reopen keeps toasts');
      assert.strictEqual(this.service.readLastChat().chatId, 'c-1');

      this.service.disconnectSocket();
      assert.strictEqual(this.service.unread.size, 0);
      assert.deepEqual(this.removed, [1], 'toast removed');
      assert.strictEqual(this.service._toastIds.size, 0);
      assert.strictEqual(
        this.service.readLastChat(),
        null,
        'saved chat cleared',
      );
      assert.strictEqual(localStorage.getItem('wa:lastChat:u-1'), null);
    });

    test('a seed never overwrites an unread update newer than its request', async function (assert) {
      this.socket.fire('whatsapp:ready', { recovered: false });
      this.socket.fire('whatsapp:unread', {
        chatId: 'c-1',
        unreadCount: 0,
        lastReadMessageId: 'm-9',
      });
      await settled();

      assert.strictEqual(
        this.service.unread.get('c-1').lastReadMessageId,
        'm-9',
        'live update kept over the resync seed',
      );
      assert.strictEqual(this.service.unread.get('c-2').unreadCount, 1);

      const older = this.service.beginUnreadSeed();
      const newer = this.service.beginUnreadSeed();
      this.service.seedUnread([{ chatId: 'c-4', unreadCount: 2 }], newer);
      this.service.seedUnread([{ chatId: 'c-3', unreadCount: 5 }], older);
      assert.false(this.service.unread.has('c-3'), 'older request skipped');
      assert.deepEqual([...this.service.unread.keys()], ['c-4']);
    });

    test('a newer request still applies when an older request resolves first', function (assert) {
      const setupTicket = this.service.beginUnreadSeed();
      const resyncTicket = this.service.beginUnreadSeed();
      this.service.seedUnread([{ chatId: 'c-1', unreadCount: 9 }], setupTicket);
      this.service.seedUnread(
        [{ chatId: 'c-1', unreadCount: 2 }],
        resyncTicket,
      );
      assert.strictEqual(this.service.unread.get('c-1').unreadCount, 2);
    });
  });
});
