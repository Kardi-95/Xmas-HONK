const CONFIG_URL = "./chapter_xmas_01.json";

async function loadChapter() {
  const res = await fetch(CONFIG_URL);
  if (!res.ok) throw new Error("Chapter JSON not found: " + CONFIG_URL);
  return res.json();
}

const chapter = await loadChapter();

const W = 480;
const H = 800;

// Feel tuning
const COMBO_TIMEOUT_MS = 2500;
const DOUBLE_COOKIE_DURATION_MS = 3000;

// Rare but strong powerups
const POWERUP_PRESENT_CHANCE = 0.03;
const POWERUP_MILK_CHANCE = 0.03;
const POWERUP_COOLDOWN_MS = 9000;

class PlayScene extends Phaser.Scene {
  constructor() {
    super("play");
    this.cookies = 0; // A1: only cookies are the score
    this.dead = false;
    this.started = false;
    this.muted = false;

    this.combo = 0;
    this.comboTimer = null;
    this.doubleCookieUntil = 0;

    this.invincibleUntil = 0;
    this.floatUntil = 0;
    this.baseGravityY = 820;

    this.powerupOnCooldownUntil = 0;
  }

  preload() {
    this.load.image("bg", "./assets/bg.png");
    this.load.image("player", "./assets/player.png");
    this.load.image("chimney", "./assets/chimney.png");
    this.load.image("chimney_fire", "./assets/chimney_fire.png");
    this.load.image("cookie", "./assets/cookie.png");
    this.load.image("snow", "./assets/snow.png");

    // new visuals
    this.load.image("present", "./assets/present.png");
    this.load.image("milk", "./assets/milk.png");
    this.load.image("flame", "./assets/flame.png");
    this.load.image("sparkle", "./assets/sparkle.png");
    this.load.image("fire_glow", "./assets/fire_glow.png");

    // audio
    this.load.audio("music", "./assets/music_xmas_8bit_loop.wav");
    this.load.audio("sfx_flap", "./assets/sfx_flap.wav");
    this.load.audio("sfx_cookie", "./assets/sfx_cookie.wav");
    this.load.audio("sfx_death", "./assets/sfx_death.wav");
    this.load.audio("sfx_score", "./assets/sfx_score.wav");
    this.load.audio("sfx_whoosh", "./assets/sfx_whoosh.wav");
  }

  create() {
    const base = chapter.difficulty?.base ?? {};

    // BG
    this.bg = this.add.tileSprite(W / 2, H / 2, W, H, "bg");

    // Snow ambience
    const snow = this.add.particles(0, 0, "snow", {
      x: { min: 0, max: W },
      y: { min: -10, max: 0 },
      lifespan: { min: 4500, max: 7600 },
      speedY: { min: 70, max: 160 },
      speedX: { min: -25, max: 25 },
      scale: { min: 0.35, max: 1.0 },
      alpha: { min: 0.35, max: 0.9 },
      quantity: 2,
      frequency: 55
    });
    snow.setDepth(5);

    // Physics
    this.physics.world.setBounds(0, 0, W, H);

    // Player
    this.player = this.physics.add.sprite(140, H / 2, "player");
    this.player.setScale(0.75);
    this.player.setCollideWorldBounds(true);

    // Start state: frozen in air
    this.player.body.setAllowGravity(false);
    this.player.setVelocity(0, 0);

    // Groups
    this.obstacles = this.physics.add.group();
    this.cookiesGroup = this.physics.add.group();
    this.powerups = this.physics.add.group();

    // Fire gates (gap hazard for fire chimneys)
    this.fireGates = this.physics.add.group();

    // UI: cookie counter top-center
    this.cookieIcon = this.add.image(W/2 - 34, 30, "cookie").setScale(0.75).setDepth(10);
    this.cookieText = this.add.text(W/2 + 8, 18, "0", {
      fontFamily: "monospace",
      fontSize: "30px",
      color: "#ffffff"
    }).setDepth(10);

    // Combo UI
    this.comboText = this.add.text(W/2, 60, "", {
      fontFamily: "monospace",
      fontSize: "18px",
      color: "#ffffff"
    }).setOrigin(0.5).setDepth(10).setAlpha(0);

    // Start UI
    this.titleText = this.add.text(W/2, 170, "HO-HO-HONK!", {
      fontFamily: "monospace",
      fontSize: "38px",
      color: "#ffffff"
    }).setOrigin(0.5);

    this.subText = this.add.text(W/2, 230, "Click / SPACE to Start", {
      fontFamily: "monospace",
      fontSize: "22px",
      color: "#ffffff"
    }).setOrigin(0.5).setAlpha(0.85);

    this.tweens.add({ targets: this.subText, alpha: 0.25, duration: 700, yoyo: true, repeat: -1 });

    // Audio
    this.music = this.sound.add("music", { loop: true, volume: 0.35 });
    this.sfx = {
      flap: this.sound.add("sfx_flap", { volume: 0.35 }),
      cookie: this.sound.add("sfx_cookie", { volume: 0.45 }),
      death: this.sound.add("sfx_death", { volume: 0.55 }),
      score: this.sound.add("sfx_score", { volume: 0.35 }),
      whoosh: this.sound.add("sfx_whoosh", { volume: 0.35 })
    };

    // Input
    this.input.on("pointerdown", () => this.onAction());
    this.input.keyboard.on("keydown-SPACE", () => this.onAction());

    // Mute toggle
    this.input.keyboard.on("keydown-M", () => {
      this.muted = !this.muted;
      this.sound.mute = this.muted;
    });

    // Collisions
    this.physics.add.overlap(this.player, this.obstacles, () => this.hitObstacle(), null, this);
    this.physics.add.overlap(this.player, this.cookiesGroup, (p, c) => this.collectCookie(c), null, this);
    this.physics.add.overlap(this.player, this.powerups, (p, pu) => this.collectPowerup(pu), null, this);

    // Fire gate hazard (only kills when gate is ON; body.enable toggles)
    this.physics.add.overlap(this.player, this.fireGates, () => this.hitFireGate(), null, this);

    // Spawn timer (paused)
    this.spawnTimer = this.time.addEvent({
      delay: 1200,
      loop: true,
      paused: true,
      callback: () => this.spawnPair()
    });
  }

  startGame() {
    if (this.started) return;
    this.started = true;

    const base = chapter.difficulty?.base ?? {};
    this.player.body.setAllowGravity(true);

    this.baseGravityY = 820 * (base.gravity ?? 1.0);
    this.player.body.setGravityY(this.baseGravityY);

    this.titleText.destroy();
    this.subText.destroy();

    this.spawnTimer.paused = false;
    if (!this.muted) this.music.play();

    // tiny nudge
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
    const base = chapter.difficulty?.base ?? {};
    const ramp = chapter.difficulty?.ramp ?? {};
    const steps = Math.floor((this.cookies || 0) / (ramp.everyScore ?? 10));

    const scrollSpeed = Math.min(
      (base.scrollSpeed ?? 3.0) + steps * (ramp.scrollSpeedAdd ?? 0.12),
      ramp.maxScrollSpeed ?? 4.2
    );

    const obstacleGap = Math.max(
      (base.obstacleGap ?? 155) - steps * (ramp.gapSubtract ?? 4),
      ramp.minGap ?? 130
    );

    return { scrollSpeed, obstacleGap };
  }

  flap(isStartFlap) {
    const base = chapter.difficulty?.base ?? {};
    const flapStrength = base.flapStrength ?? 8.35;

    const mult = isStartFlap ? 24 : 28;
    const impulse = -flapStrength * mult;
    this.player.setVelocityY(impulse);

    if (!this.muted) this.sfx.flap.play();
  }

  collectCookie(cookieSprite) {
    cookieSprite.destroy();

    const now = this.time.now;
    const isDouble = now < this.doubleCookieUntil;
    const add = isDouble ? 2 : 1;

    this.cookies += add;
    this.cookieText.setText(String(this.cookies));

    // UI pop
    this.tweens.add({ targets: this.cookieIcon, scale: 0.9, duration: 80, yoyo: true });
    this.tweens.add({ targets: this.cookieText, scale: 1.12, duration: 80, yoyo: true });

    this.bumpCombo();

    // dynamic music tempo
    if (this.cookies >= 20 && this.music.isPlaying) this.music.setRate(1.05);
    if (this.cookies >= 40 && this.music.isPlaying) this.music.setRate(1.1);

    if (!this.muted) this.sfx.cookie.play({ rate: 0.98 + Math.random() * 0.08 });
  }

  bumpCombo() {
    if (this.comboTimer) this.comboTimer.remove(false);
    this.comboTimer = this.time.addEvent({
      delay: COMBO_TIMEOUT_MS,
      callback: () => this.resetCombo()
    });

    this.combo += 1;

    this.comboText.setText(`COMBO x${this.combo}`);
    this.comboText.setAlpha(1);
    this.tweens.add({ targets: this.comboText, y: 58, duration: 60, yoyo: true });

    if (this.combo === 3) {
      this.doubleCookieUntil = this.time.now + DOUBLE_COOKIE_DURATION_MS;
      this.showComboBoost();
    }

    if (this.combo === 5) {
      this.sparkleBurst(this.player.x + 10, this.player.y - 10);
    }
  }

  resetCombo() {
    this.combo = 0;
    this.comboText.setAlpha(0);
  }

  showComboBoost() {
    this.comboText.setText("COMBO BONUS! 2x COOKIES");
    this.comboText.setAlpha(1);
    this.tweens.add({ targets: this.comboText, alpha: 0, duration: 900, delay: 900 });
    this.sparkleBurst(W/2, 34);
    if (!this.muted) this.sfx.score.play({ rate: 1.05 });
  }

  sparkleBurst(x, y) {
    for (let i = 0; i < 6; i++) {
      const s = this.add.image(x, y, "sparkle").setScale(0.8).setDepth(20);
      const ang = Math.random() * Math.PI * 2;
      const dist = 18 + Math.random() * 24;
      this.tweens.add({
        targets: s,
        x: x + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist,
        alpha: 0,
        scale: 1.4,
        duration: 420,
        onComplete: () => s.destroy()
      });
    }
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

    this.powerupOnCooldownUntil = now + POWERUP_COOLDOWN_MS;
  }

  spawnPair() {
    if (!this.started || this.dead) return;

    const { scrollSpeed, obstacleGap } = this.getRamped();
    const centerY = Phaser.Math.Between(240, H - 240);
    const topY = centerY - obstacleGap / 2 - 300;
    const botY = centerY + obstacleGap / 2 + 300;

    const variantId = pickVariantId(chapter.obstacles?.variants ?? []);
    const isFire = (variantId === "chimney_fire");

    const tex = isFire ? "chimney_fire" : "chimney";
    const top = this.obstacles.create(W + 70, topY, tex);
    const bot = this.obstacles.create(W + 70, botY, tex);

    [top, bot].forEach(o => {
      o.setImmovable(true);
      o.body.allowGravity = false;
      o.setVelocityX(-scrollSpeed * 115);
      o.setData("isFire", isFire);
      // fire gate handled per pair
    });

    // Fire hazard fills the gap between the two chimneys (bursts ON/OFF)
    if (isFire) {
      const gateHeight = Math.max(60, obstacleGap - 18);
      this.attachFireGatePair(W + 70, centerY, gateHeight, -scrollSpeed * 115);
    }

    const now = this.time.now;
    const canPowerup = now > this.powerupOnCooldownUntil;

    // spawn in gap: rare powerup OR cookie
    let spawned = false;
    if (canPowerup && Math.random() < POWERUP_PRESENT_CHANCE) {
      const pu = this.powerups.create(W + 70, centerY, "present");
      pu.body.allowGravity = false;
      pu.setVelocityX(-scrollSpeed * 115);
      pu.setData("kind", "present");
      spawned = true;
    } else if (canPowerup && Math.random() < POWERUP_MILK_CHANCE) {
      const pu = this.powerups.create(W + 70, centerY, "milk");
      pu.body.allowGravity = false;
      pu.setVelocityX(-scrollSpeed * 115);
      pu.setData("kind", "milk");
      spawned = true;
    }

    if (!spawned) {
      const cookieChance = (chapter.collectibles ?? []).find(x => x.id === "cookie_coin")?.spawn?.chance ?? 0.28;
      if (Math.random() < cookieChance) {
        const cookie = this.cookiesGroup.create(W + 70, centerY, "cookie");
        cookie.body.allowGravity = false;
        cookie.setVelocityX(-scrollSpeed * 115);
      }
    }
  }

  attachFireGatePair(xStart, centerY, gapHeight, velX) {
    // Visual: a vertical flame strip that fills the gap between chimneys
    const flame = this.add.image(xStart, centerY, "flame").setDepth(6);
    const glow = this.add.image(xStart, centerY, "fire_glow").setDepth(5);
    glow.setAlpha(0.0);
    glow.setScale(1.8, Math.max(1.0, gapHeight / 90));
    flame.setAlpha(0.0);
    flame.setScale(1.4, Math.max(1.0, gapHeight / 38)); // stretch vertically

    // Physics hazard zone (only active when flame is ON)
    const zone = this.add.zone(xStart, centerY, 70, gapHeight);
    this.physics.add.existing(zone);
    zone.body.setAllowGravity(false);
    zone.body.setImmovable(true);
    zone.body.setVelocityX(velX);
    zone.body.enable = false; // starts off

    // Keep references for update cleanup
    zone.setData("flameSprite", flame);
    zone.setData("glowSprite", glow);
    zone.setData("isFireGate", true);
    this.fireGates.add(zone);

    const burstOnce = () => {
      if (!zone.active || this.dead) {
        flame.destroy();
        glow.destroy();
        if (zone.body) zone.body.enable = false;
        zone.destroy();
        return;
      }

      // Random off window then a quick ON burst
      const offDelay = 450 + Math.random() * 900;   // time between bursts
      const onDuration = 180 + Math.random() * 140; // burst length

      // Turn ON
      zone.body.enable = true;
      flame.setAlpha(0.0);
      glow.setAlpha(0.0);
      if (!this.muted) this.sfx.whoosh.play({ rate: 0.95 + Math.random()*0.12 });

      this.tweens.add({
        targets: [flame, glow],
        alpha: { from: 0.0, to: 1.0 },
        scaleX: { from: 1.25, to: 1.55 },
        duration: 90,
        yoyo: true,
        repeat: 1,
        onComplete: () => {
          // Turn OFF
          zone.body.enable = false;
          flame.setAlpha(0.0);
          glow.setAlpha(0.0);
          this.time.delayedCall(offDelay, burstOnce);
        }
      });

      // Safety: force-off after onDuration even if tween timing differs
      this.time.delayedCall(onDuration, () => {
        if (!zone.active) return;
        zone.body.enable = false;
        flame.setAlpha(0.0);
        glow.setAlpha(0.0);
      });
    };

    // Start bursts
    this.time.delayedCall(250 + Math.random() * 500, burstOnce);
  });
      } else {
        flame.setAlpha(0.0);
        this.time.delayedCall(delay, pulseOnce);
      }
    };

    this.time.delayedCall(200 + Math.random() * 500, pulseOnce);
  }

  hitObstacle() {
    if (this.time.now < this.invincibleUntil) return; // ghost mode
    this.die();
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.spawnTimer.paused = true;

    if (!this.muted) this.sfx.death.play();
    this.music.stop();

    // death juice
    this.cameras.main.shake(180, 0.006);
    const puff = this.add.particles(0, 0, "snow", {
      x: this.player.x,
      y: this.player.y,
      lifespan: 450,
      speed: { min: 60, max: 190 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.9, end: 0.0 },
      quantity: 14,
      alpha: { start: 0.9, end: 0.0 }
    });
    this.time.delayedCall(500, () => puff.destroy());

    this.player.setTint(0xff4d4d);
    this.player.setVelocity(0, 0);

    this.add.rectangle(W/2, H/2, 390, 270, 0x000000, 0.62).setStrokeStyle(2, 0xffffff, 0.35);
    this.add.text(W/2, H/2 - 10, `GAME OVER\nCookies: ${this.cookies}\n\nClick to retry`, {
      fontFamily: "monospace",
      fontSize: "26px",
      color: "#ffffff",
      align: "center"
    }).setOrigin(0.5);

    this.input.once("pointerdown", () => this.scene.restart());
  }

  update() {
    if (!this.started || this.dead) return;

    const { scrollSpeed } = this.getRamped();
    this.bg.tilePositionX += scrollSpeed * 1.4;

    const now = this.time.now;

    // restore buffs
    if (now >= this.floatUntil) this.player.body.setGravityY(this.baseGravityY);
    if (now >= this.invincibleUntil && now >= this.floatUntil) {
      this.player.clearTint();
      this.player.setAlpha(1);
    }

    // cleanup obstacles
    this.obstacles.children.each((o) => {
      if (!o.active) return;
      if (o.x < -140) o.destroy();
    });

    this.cookiesGroup.children.each((c) => { if (c.active && c.x < -140) c.destroy(); });
    this.powerups.children.each((p) => { if (p.active && p.x < -140) p.destroy(); });
  }
}

function pickVariantId(variants) {
  if (!variants.length) return "chimney_normal";
  const total = variants.reduce((s, v) => s + (v.weight ?? 0), 0);
  let r = Math.random() * total;
  for (const v of variants) {
    r -= (v.weight ?? 0);
    if (r <= 0) return v.id;
  }
  return variants[0].id;
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: W,
  height: H,
  backgroundColor: "#081426",
  physics: { default: "arcade" },
  scene: [PlayScene]
});
