// HO-HO-HONK v8 (all-in-one assets, no top-level await)
// Phaser loaded globally via CDN in index.html

const W = 480;
const H = 800;

const KEYS = {
  bg: "bg",
  player: "player",
  chimney: "chimney",
  chimneyFire: "chimney_fire",
  cookie: "cookie",
  snow: "snow",
  present: "present",
  milk: "milk",
  flame: "flame",
  sparkle: "sparkle",
  fireGlow: "fire_glow",
  music: "music",
  sfxFlap: "sfx_flap",
  sfxCookie: "sfx_cookie",
  sfxDeath: "sfx_death",
  sfxScore: "sfx_score",
  sfxWhoosh: "sfx_whoosh",
};

class BootScene extends Phaser.Scene {
  constructor() { super("boot"); }

  preload() {
    // Config JSON
    this.load.json("chapter", "./chapter_xmas_01.json");

    // Images
    this.load.image(KEYS.bg, "./assets/bg.png");
    this.load.image(KEYS.player, "./assets/player.png");
    this.load.image(KEYS.chimney, "./assets/chimney.png");
    this.load.image(KEYS.chimneyFire, "./assets/chimney_fire.png");
    this.load.image(KEYS.cookie, "./assets/cookie.png");
    this.load.image(KEYS.snow, "./assets/snow.png");

    this.load.image(KEYS.present, "./assets/present.png");
    this.load.image(KEYS.milk, "./assets/milk.png");
    this.load.image(KEYS.flame, "./assets/flame.png");
    this.load.image(KEYS.sparkle, "./assets/sparkle.png");
    this.load.image(KEYS.fireGlow, "./assets/fire_glow.png");

    // Audio
    this.load.audio(KEYS.music, "./assets/music_xmas_8bit_loop.wav");
    this.load.audio(KEYS.sfxFlap, "./assets/sfx_flap.wav");
    this.load.audio(KEYS.sfxCookie, "./assets/sfx_cookie.wav");
    this.load.audio(KEYS.sfxDeath, "./assets/sfx_death.wav");
    this.load.audio(KEYS.sfxScore, "./assets/sfx_score.wav");
    this.load.audio(KEYS.sfxWhoosh, "./assets/sfx_whoosh.wav");

    // Tiny loading text
    const t = this.add.text(W/2, H/2, "Loading…", {
      fontFamily: "monospace",
      fontSize: "22px",
      color: "#ffffff",
    }).setOrigin(0.5);
    this.load.on("complete", () => t.destroy());
  }

  create() {
    const chapter = this.cache.json.get("chapter") || {};
    this.scene.start("play", { chapter });
  }
}

class PlayScene extends Phaser.Scene {
  constructor() {
    super("play");
    this.started = false;
    this.dead = false;
    this.muted = false;

    this.cookies = 0;
    this.combo = 0;
    this.comboTimer = null;
    this.doubleCookieUntil = 0;

    this.invincibleUntil = 0;
    this.floatUntil = 0;

    this.powerupOnCooldownUntil = 0;

    this.scrollSpeed = 3.0;
    this.obstacleGap = 155;
    this.obstacleSpacing = 290;

    this.firePieces = []; // for cleanup (sprites + zone)
  }

  init(data) {
    this.chapter = (data && (data.chapter || data)) || {};
  }

  preload() {
    // nothing: BootScene already loaded everything
  }

  create() {
    const base = this.chapter?.difficulty?.base || {};
    this.scrollSpeed = base.scrollSpeed ?? 3.0;
    this.obstacleGap = base.obstacleGap ?? 155;
    this.obstacleSpacing = base.obstacleSpacing ?? 290;

    // BG
    this.bg = this.add.tileSprite(W/2, H/2, W, H, KEYS.bg);

    // Xmas lights (procedural, no extra assets)
    this.createXmasLights();

    // Snow ambience
    this.snow = this.add.particles(0, 0, KEYS.snow, {
      x: { min: 0, max: W },
      y: { min: -10, max: 0 },
      lifespan: { min: 4600, max: 7600 },
      speedY: { min: 70, max: 165 },
      speedX: { min: -25, max: 25 },
      scale: { min: 0.35, max: 1.0 },
      alpha: { min: 0.25, max: 0.9 },
      quantity: 2,
      frequency: 55
    });
    this.snow.setDepth(5);

    // Physics
    this.physics.world.setBounds(0, 0, W, H);

    // Player
    this.player = this.physics.add.sprite(140, H/2, KEYS.player);
    this.player.setScale(0.75);
    this.player.setCollideWorldBounds(true);

    // Start: frozen
    this.player.body.setAllowGravity(false);
    this.player.setVelocity(0, 0);

    // Groups
    this.obstacles = this.physics.add.group();
    this.cookiesGroup = this.physics.add.group();
    this.powerups = this.physics.add.group();
    this.fireGates = this.physics.add.group();

    // UI: cookie counter
    this.cookieIcon = this.add.image(W/2 - 34, 30, KEYS.cookie).setScale(0.75).setDepth(20);
    this.cookieText = this.add.text(W/2 + 8, 18, "0", {
      fontFamily: "monospace",
      fontSize: "30px",
      color: "#ffffff",
    }).setDepth(20);

    // Combo UI
    this.comboText = this.add.text(W/2, 60, "", {
      fontFamily: "monospace",
      fontSize: "18px",
      color: "#ffffff",
    }).setOrigin(0.5).setDepth(20).setAlpha(0);

    // Start UI
    this.titleText = this.add.text(W/2, 170, "HO-HO-HONK!", {
      fontFamily: "monospace",
      fontSize: "38px",
      color: "#ffffff",
    }).setOrigin(0.5).setDepth(20);

    this.subText = this.add.text(W/2, 230, "Click / SPACE to Start", {
      fontFamily: "monospace",
      fontSize: "22px",
      color: "#ffffff",
    }).setOrigin(0.5).setDepth(20).setAlpha(0.85);

    this.tweens.add({ targets: this.subText, alpha: 0.25, duration: 700, yoyo: true, repeat: -1 });

    // Audio
    this.music = this.sound.add(KEYS.music, { loop: true, volume: 0.35 });
    this.sfx = {
      flap: this.sound.add(KEYS.sfxFlap, { volume: 0.35 }),
      cookie: this.sound.add(KEYS.sfxCookie, { volume: 0.45 }),
      death: this.sound.add(KEYS.sfxDeath, { volume: 0.55 }),
      score: this.sound.add(KEYS.sfxScore, { volume: 0.35 }),
      whoosh: this.sound.add(KEYS.sfxWhoosh, { volume: 0.35 }),
    };

    // Input
    this.input.on("pointerdown", () => this.onAction());
    this.input.keyboard.on("keydown-SPACE", () => this.onAction());
    this.input.keyboard.on("keydown-M", () => {
      this.muted = !this.muted;
      this.sound.mute = this.muted;
    });

    // Collisions
    this.physics.add.overlap(this.player, this.obstacles, () => this.hitObstacle(), null, this);
    this.physics.add.overlap(this.player, this.cookiesGroup, (p, c) => this.collectCookie(c), null, this);
    this.physics.add.overlap(this.player, this.powerups, (p, pu) => this.collectPowerup(pu), null, this);
    this.physics.add.overlap(this.player, this.fireGates, (p, z) => this.hitFireGate(z), null, this);

    // Spawn timer (paused until start)
    this.spawnTimer = this.time.addEvent({
      delay: this.obstacleSpacing * 4, // will be recalculated on start
      loop: true,
      paused: true,
      callback: () => this.spawnPair(),
    });
  }

  // ---------- visuals ----------
  createXmasLights() {
    // A simple blinking garland at the top of the screen
    this.lights = [];
    const count = 14;
    for (let i = 0; i < count; i++) {
      const x = 30 + (i * (W - 60) / (count - 1));
      const y = 18 + (Math.sin(i * 0.55) * 6);

      const g = this.add.graphics().setDepth(15);
      g.fillStyle(this.pickLightColor(i), 1);
      g.fillCircle(x, y, 5);
      g.lineStyle(2, 0x000000, 0.25);
      g.strokeCircle(x, y, 5);
      this.lights.push(g);

      // blinking
      this.tweens.add({
        targets: g,
        alpha: { from: 0.35, to: 1.0 },
        duration: 280 + (i % 4) * 90,
        yoyo: true,
        repeat: -1,
        delay: i * 40,
      });
    }

    // string line
    const wire = this.add.graphics().setDepth(14);
    wire.lineStyle(2, 0x0b0f18, 0.6);
    for (let i = 0; i < count - 1; i++) {
      const x1 = 30 + (i * (W - 60) / (count - 1));
      const y1 = 18 + (Math.sin(i * 0.55) * 6);
      const x2 = 30 + ((i + 1) * (W - 60) / (count - 1));
      const y2 = 18 + (Math.sin((i + 1) * 0.55) * 6);
      wire.lineBetween(x1, y1, x2, y2);
    }
    this.lightsWire = wire;
  }

  pickLightColor(i) {
    const colors = [0xff4d4d, 0x4dff7a, 0xffd54d, 0x4dd8ff, 0xd44dff];
    return colors[i % colors.length];
  }

  sparkleBurst(x, y) {
    for (let i = 0; i < 6; i++) {
      const s = this.add.image(x, y, KEYS.sparkle).setScale(0.8).setDepth(30);
      const ang = Math.random() * Math.PI * 2;
      const dist = 18 + Math.random() * 24;
      this.tweens.add({
        targets: s,
        x: x + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist,
        alpha: 0,
        scale: 1.4,
        duration: 420,
        onComplete: () => s.destroy(),
      });
    }
  }

  // ---------- game flow ----------
  startGame() {
    if (this.started) return;
    this.started = true;

    const base = this.chapter?.difficulty?.base || {};
    this.player.body.setAllowGravity(true);

    const gravityMult = base.gravity ?? 1.0;
    this.baseGravityY = 820 * gravityMult;
    this.player.body.setGravityY(this.baseGravityY);

    this.titleText.destroy();
    this.subText.destroy();

    // spawn speed
    this.spawnTimer.delay = Math.max(900, (base.obstacleSpacing ?? 290) * 4);
    this.spawnTimer.paused = false;

    if (!this.muted) this.music.play();

    // nudge
    this.player.setVelocityY(-160);
  }

  onAction() {
    if (this.dead) return;
    if (!this.started) {
      this.startGame();
      this.flap(true);
      return;
    }
    this.flap(false);
  }

  getRamped() {
    const base = this.chapter?.difficulty?.base || {};
    const ramp = this.chapter?.difficulty?.ramp || {};
    const score = this.cookies || 0;

    const steps = Math.floor(score / (ramp.everyScore ?? 10));

    const scrollSpeed = Math.min(
      (base.scrollSpeed ?? 3.0) + steps * (ramp.scrollSpeedAdd ?? 0.12),
      ramp.maxScrollSpeed ?? 4.2
    );

    const obstacleGap = Math.max(
      (base.obstacleGap ?? 155) - steps * (ramp.gapSubtract ?? 4),
      ramp.minGap ?? 130
    );

    const obstacleSpacing = Math.max(
      (base.obstacleSpacing ?? 290) - steps * (ramp.spacingSubtract ?? 3),
      240
    );

    return { scrollSpeed, obstacleGap, obstacleSpacing };
  }

  flap(isStartFlap) {
    const base = this.chapter?.difficulty?.base || {};
    const flapStrength = base.flapStrength ?? 8.35;

    // shorter taps: lower impulse than earlier buggy builds
    const mult = isStartFlap ? 22 : 24;
    const impulse = -flapStrength * mult;
    this.player.setVelocityY(impulse);

    if (!this.muted) this.sfx.flap.play();
  }

  // ---------- spawning ----------
  pickVariantId() {
    const variants = this.chapter?.obstacles?.variants || [];
    if (!variants.length) return "chimney_normal";

    const total = variants.reduce((s, v) => s + (v.weight ?? 0), 0);
    let r = Math.random() * total;

    for (const v of variants) {
      r -= (v.weight ?? 0);
      if (r <= 0) return v.id;
    }
    return variants[0].id;
  }

  spawnPair() {
    if (!this.started || this.dead) return;

    const ramped = this.getRamped();
    const scrollSpeed = ramped.scrollSpeed;
    const obstacleGap = ramped.obstacleGap;
    const obstacleSpacing = ramped.obstacleSpacing;
    this.spawnTimer.delay = obstacleSpacing * 4;

    const centerY = Phaser.Math.Between(240, H - 240);
    const topY = centerY - obstacleGap / 2 - 300;
    const botY = centerY + obstacleGap / 2 + 300;

    const variantId = this.pickVariantId();
    const isFire = (variantId === "chimney_fire");
    const tex = isFire ? KEYS.chimneyFire : KEYS.chimney;

    const velX = -scrollSpeed * 115;

    const top = this.obstacles.create(W + 70, topY, tex);
    const bot = this.obstacles.create(W + 70, botY, tex);

    [top, bot].forEach(o => {
      o.setImmovable(true);
      o.body.allowGravity = false;
      o.setVelocityX(velX);
    });

    // Fire hazard fills the gap between the two chimneys
    if (isFire) {
      const gateHeight = Math.max(60, obstacleGap - 10);
      this.attachFireGatePair(W + 70, centerY, gateHeight, velX);
    }

    // Spawn cookie / powerups inside gap
    const now = this.time.now;
    const POWERUP_COOLDOWN_MS = 9000;
    const canPowerup = now > this.powerupOnCooldownUntil;

    const PRESENT_CHANCE = 0.03;
    const MILK_CHANCE = 0.03;

    let spawned = false;
    if (canPowerup && Math.random() < PRESENT_CHANCE) {
      const pu = this.powerups.create(W + 70, centerY, KEYS.present);
      pu.body.allowGravity = false;
      pu.setVelocityX(velX);
      pu.setData("kind", "present");
      spawned = true;
    } else if (canPowerup && Math.random() < MILK_CHANCE) {
      const pu = this.powerups.create(W + 70, centerY, KEYS.milk);
      pu.body.allowGravity = false;
      pu.setVelocityX(velX);
      pu.setData("kind", "milk");
      spawned = true;
    }

    if (!spawned) {
      const cookieChance = (this.chapter?.collectibles || []).find(x => x.id === "cookie_coin")?.spawn?.chance ?? 0.28;
      if (Math.random() < cookieChance) {
        const cookie = this.cookiesGroup.create(W + 70, centerY, KEYS.cookie);
        cookie.body.allowGravity = false;
        cookie.setVelocityX(velX);
      }
    }

    if (spawned) this.powerupOnCooldownUntil = now + POWERUP_COOLDOWN_MS;
  }

  attachFireGatePair(xStart, centerY, gapHeight, velX) {
    // Visual: flame strip + glow, stretched vertically.
    const flame = this.add.image(xStart, centerY, KEYS.flame).setDepth(10);
    const glow = this.add.image(xStart, centerY, KEYS.fireGlow).setDepth(9);

    // stretch to fill the gap
    flame.setScale(1.35, Math.max(1.0, gapHeight / 38));
    glow.setScale(1.6, Math.max(1.0, gapHeight / 90));

    flame.setAlpha(0);
    glow.setAlpha(0);

    // Physics hazard zone (active only during burst)
    const zone = this.add.zone(xStart, centerY, 92, gapHeight);
    this.physics.add.existing(zone);
    zone.body.setAllowGravity(false);
    zone.body.setImmovable(true);
    zone.body.setVelocityX(velX);
    zone.body.enable = false;

    // Store for cleanup
    this.fireGates.add(zone);
    this.firePieces.push({ zone, flame, glow });

    const burst = () => {
      if (this.dead || !zone.active) return;

      const offDelay = 420 + Math.random() * 680;   // time between bursts (more frequent)
      const onDuration = 380 + Math.random() * 420; // burst length (more visible)

      // Turn ON (explosive)
      zone.body.enable = true;

      if (!this.muted) this.sfx.whoosh.play({ rate: 0.95 + Math.random() * 0.12 });

      flame.setAlpha(1);
      glow.setAlpha(1.0);
      flame.setScale(1.15, Math.max(1.0, gapHeight / 44));
      glow.setScale(1.25, Math.max(1.0, gapHeight / 100));

      // Pop + flicker
      this.tweens.add({
        targets: [flame, glow],
        scaleX: { from: 1.25, to: 2.25 },
        alpha: { from: 1.0, to: 0.0 },
        duration: onDuration,
        ease: "Quad.easeOut",
        onComplete: () => {
          // Turn OFF
          if (!zone.active) return;
          zone.body.enable = false;
          flame.setAlpha(0);
          glow.setAlpha(0);

          // Next burst
          this.time.delayedCall(offDelay, burst);
        }
      });

      // Sparkles at the start of the burst (looks like a mini explosion)
      this.sparkleBurst(xStart, centerY);
    };

    // Start first burst after a short random delay
    this.time.delayedCall(260 + Math.random() * 520, burst);
  }

  // ---------- scoring / powerups ----------
  collectCookie(cookieSprite) {
    cookieSprite.destroy();

    const now = this.time.now;
    const isDouble = now < this.doubleCookieUntil;
    const add = isDouble ? 2 : 1;

    this.cookies += add;
    this.cookieText.setText(String(this.cookies));

    // pop UI
    this.tweens.add({ targets: this.cookieIcon, scale: 0.9, duration: 80, yoyo: true });
    this.tweens.add({ targets: this.cookieText, scale: 1.12, duration: 80, yoyo: true });

    this.bumpCombo();

    // subtle music tempo ramp
    if (this.cookies >= 20 && this.music.isPlaying) this.music.setRate(1.05);
    if (this.cookies >= 40 && this.music.isPlaying) this.music.setRate(1.1);

    if (!this.muted) this.sfx.cookie.play({ rate: 0.98 + Math.random() * 0.08 });
  }

  bumpCombo() {
    const COMBO_TIMEOUT_MS = 2500;
    const DOUBLE_COOKIE_DURATION_MS = 3000;

    if (this.comboTimer) this.comboTimer.remove(false);
    this.comboTimer = this.time.addEvent({
      delay: COMBO_TIMEOUT_MS,
      callback: () => this.resetCombo(),
    });

    this.combo += 1;
    this.comboText.setText(`COMBO x${this.combo}`);
    this.comboText.setAlpha(1);
    this.tweens.add({ targets: this.comboText, y: 58, duration: 60, yoyo: true });

    if (this.combo === 3) {
      this.doubleCookieUntil = this.time.now + DOUBLE_COOKIE_DURATION_MS;
      this.comboText.setText("COMBO BONUS! 2x COOKIES");
      this.tweens.add({ targets: this.comboText, alpha: 0, duration: 900, delay: 900 });
      this.sparkleBurst(W/2, 34);
      if (!this.muted) this.sfx.score.play({ rate: 1.05 });
    }
  }

  resetCombo() {
    this.combo = 0;
    this.comboText.setAlpha(0);
  }

  collectPowerup(pu) {
    const kind = pu.getData("kind");
    pu.destroy();

    const now = this.time.now;
    if (kind === "present") {
      this.invincibleUntil = now + 2500;
      this.player.setTint(0x88ddff);
      this.tweens.add({ targets: this.player, alpha: 0.65, duration: 120, yoyo: true, repeat: 10 });
      this.sparkleBurst(this.player.x, this.player.y);
      if (!this.muted) this.sfx.score.play({ rate: 1.12 });
    } else if (kind === "milk") {
      this.floatUntil = now + 3000;
      this.player.setTint(0xddeeff);
      this.player.body.setGravityY(this.baseGravityY * 0.55);
      this.sparkleBurst(this.player.x, this.player.y);
      if (!this.muted) this.sfx.score.play({ rate: 0.95 });
    }
  }

  // ---------- collisions ----------
  hitObstacle() {
    if (this.time.now < this.invincibleUntil) return;
    this.die();
  }

  hitFireGate(zone) {
    // only kills when gate is active
    if (!zone.body || !zone.body.enable) return;
    if (this.time.now < this.invincibleUntil) return;
    this.die();
  }

  // ---------- game over ----------
  die() {
    if (this.dead) return;
    this.dead = true;
    this.spawnTimer.paused = true;

    if (!this.muted) this.sfx.death.play();
    this.music.stop();

    // Camera shake
    this.cameras.main.shake(180, 0.006);

    // Player feedback
    this.player.setTint(0xff4d4d);
    this.player.setVelocity(0, 0);

    // Overlay + animated score screen
    this.showGameOver();
  }

  showGameOver() {
    const overlay = this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.55).setDepth(50);
    const panel = this.add.rectangle(W/2, H/2, 390, 270, 0x0b0f18, 0.85)
      .setStrokeStyle(2, 0xffffff, 0.25)
      .setDepth(51);

    const title = this.add.text(W/2, H/2 - 76, "GAME OVER", {
      fontFamily: "monospace",
      fontSize: "34px",
      color: "#ffffff",
    }).setOrigin(0.5).setDepth(52);

    // (cookie icon removed to avoid missing-asset issues)
    const scoreLabel = this.add.text(W/2, H/2 - 40, `Cookies: ${this.cookies}`, {
      fontFamily: "monospace",
      fontSize: "44px",
      color: "#ffffff",
    }).setOrigin(0.5).setDepth(52);

    const hint = this.add.text(W/2, H/2 + 72, "Click to retry", {
      fontFamily: "monospace",
      fontSize: "22px",
      color: "#ffffff",
    }).setOrigin(0.5).setDepth(52);

    const ui = this.add.container(0, 0, [overlay, panel, title, scoreLabel, hint]).setDepth(50);
    ui.setAlpha(0);
    ui.setScale(0.75);

    this.tweens.add({
      targets: ui,
      alpha: 1,
      scale: 1,
      duration: 420,
      ease: "Back.easeOut",
    });

    this.tweens.add({ targets: hint, alpha: 0.25, duration: 600, yoyo: true, repeat: -1, delay: 300 });

    // Confetti-like sparkle burst near score
    this.time.delayedCall(120, () => this.sparkleBurst(W/2, H/2 - 18));

    this.input.once("pointerdown", () => this.scene.restart());
  }

  // ---------- update / cleanup ----------
  update() {
    if (!this.started || this.dead) return;

    const ramped = this.getRamped();
    const scrollSpeed = ramped.scrollSpeed;
    this.bg.tilePositionX += scrollSpeed * 1.4;

    const now = this.time.now;

    // restore buffs
    if (now >= this.floatUntil) this.player.body.setGravityY(this.baseGravityY);
    if (now >= this.invincibleUntil && now >= this.floatUntil) {
      this.player.clearTint();
      this.player.setAlpha(1);
    }

    // cleanup obstacles / items
    this.obstacles.children.each(o => { if (o.active && o.x < -140) o.destroy(); });
    this.cookiesGroup.children.each(c => { if (c.active && c.x < -140) c.destroy(); });
    this.powerups.children.each(p => { if (p.active && p.x < -140) p.destroy(); });

    // cleanup fire pieces
    for (let i = this.firePieces.length - 1; i >= 0; i--) {
      const fp = this.firePieces[i];
      if (!fp.zone?.active) { this.firePieces.splice(i, 1); continue; }
      if (fp.zone.x < -160) {
        fp.zone.destroy();
        fp.flame.destroy();
        fp.glow.destroy();
        this.firePieces.splice(i, 1);
      } else {
        // keep visuals aligned to moving zone
        fp.flame.x = fp.zone.x;
        fp.glow.x = fp.zone.x;
      }
    }
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: W,
  height: H,
  backgroundColor: "#081426",
  physics: { default: "arcade" },
  scene: [BootScene, PlayScene],
});
