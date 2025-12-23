const CONFIG_URL = "./chapter_xmas_01.json";

async function loadChapter() {
  const res = await fetch(CONFIG_URL);
  if (!res.ok) throw new Error("Chapter JSON not found: " + CONFIG_URL);
  return res.json();
}

const chapter = await loadChapter();

const W = 480;
const H = 800;

class PlayScene extends Phaser.Scene {
  constructor() {
    super("play");
    this.score = 0;
    this.dead = false;
    this.passedPairs = 0;
  }

  preload() {
    this.load.image("bg", "./assets/bg.png");
    this.load.image("duck", "./assets/duck.png");
    this.load.image("chimney", "./assets/chimney.png");
    this.load.image("chimney_fire", "./assets/chimney_fire.png");
    this.load.image("cookie", "./assets/cookie.png");
  }

  create() {
    const base = chapter.difficulty?.base ?? {};

    // BG
    this.bg = this.add.tileSprite(W / 2, H / 2, W, H, "bg");

    // Physics world bounds with a little padding
    this.physics.world.setBounds(0, 0, W, H);

    // Player
    this.player = this.physics.add.sprite(140, H / 2, "duck");
    this.player.setScale(chapter.player?.scale ?? 1);
    this.player.body.setGravityY(800 * (base.gravity ?? 1.0));
    this.player.setCollideWorldBounds(true);

    // Groups
    this.obstacles = this.physics.add.group();
    this.cookies = this.physics.add.group();

    // Score UI
    this.scoreText = this.add.text(16, 16, "0", {
      fontFamily: "monospace",
      fontSize: "30px",
      color: "#ffffff"
    });

    // Input
    this.input.on("pointerdown", () => this.flap());
    this.input.keyboard.on("keydown-SPACE", () => this.flap());

    // Collisions
    this.physics.add.overlap(this.player, this.obstacles, () => this.die(), null, this);
    this.physics.add.overlap(this.player, this.cookies, (p, c) => {
      c.destroy();
      this.score += 1;
      this.scoreText.setText(String(this.score));
    }, null, this);

    // Spawn timer based on spacing
    this.spawnDelayMs = 1300;
    this.spawnTimer = this.time.addEvent({
      delay: this.spawnDelayMs,
      loop: true,
      callback: () => this.spawnPair()
    });

    // Start prompt
    this.add.text(W/2, 120, "HO-HO-HONK!", {
      fontFamily: "monospace",
      fontSize: "34px",
      color: "#ffffff"
    }).setOrigin(0.5);
  }

  getRamped() {
    const base = chapter.difficulty?.base ?? {};
    const ramp = chapter.difficulty?.ramp ?? {};
    const steps = Math.floor((this.score || 0) / (ramp.everyScore ?? 10));

    const scrollSpeed = Math.min(
      (base.scrollSpeed ?? 3.0) + steps * (ramp.scrollSpeedAdd ?? 0.12),
      ramp.maxScrollSpeed ?? 4.2
    );

    const obstacleGap = Math.max(
      (base.obstacleGap ?? 150) - steps * (ramp.gapSubtract ?? 4),
      ramp.minGap ?? 128
    );

    const obstacleSpacing = Math.max(
      (base.obstacleSpacing ?? 280) - steps * (ramp.spacingSubtract ?? 3),
      220
    );

    return { scrollSpeed, obstacleGap, obstacleSpacing };
  }

  flap() {
    if (this.dead) return;
    const base = chapter.difficulty?.base ?? {};
    const flapStrength = base.flapStrength ?? 8.35;
    this.player.setVelocityY(-flapStrength * 60);
  }

  spawnPair() {
    if (this.dead) return;

    const { scrollSpeed, obstacleGap } = this.getRamped();

    const centerY = Phaser.Math.Between(230, H - 230);
    const topY = centerY - obstacleGap / 2 - 300;
    const botY = centerY + obstacleGap / 2 + 300;

    // Weighted chimney variant pick
    const variantId = pickVariantId(chapter.obstacles?.variants ?? []);
    const tex = (variantId === "chimney_fire") ? "chimney_fire" : "chimney";

    const top = this.obstacles.create(W + 60, topY, tex);
    const bot = this.obstacles.create(W + 60, botY, tex);

    // Pipe/chimney behavior
    [top, bot].forEach(o => {
      o.setImmovable(true);
      o.body.allowGravity = false;
      o.setVelocityX(-scrollSpeed * 115);
      o.setData("scorable", true);
    });

    // Cookie spawn chance in the gap
    const cookieCfg = (chapter.collectibles ?? []).find(x => x.id === "cookie_coin");
    const cookieChance = cookieCfg?.spawn?.chance ?? 0.25;

    if (Math.random() < cookieChance) {
      const cookie = this.cookies.create(W + 60, centerY, "cookie");
      cookie.body.allowGravity = false;
      cookie.setVelocityX(-scrollSpeed * 115);
    }
  }

  update() {
    if (this.dead) return;

    const { scrollSpeed } = this.getRamped();
    this.bg.tilePositionX += scrollSpeed * 1.4;

    // Award score for passing chimneys (one point per pair)
    this.obstacles.children.each((o) => {
      if (!o.active) return;
      const scorable = o.getData("scorable");
      if (scorable && o.x < this.player.x) {
        o.setData("scorable", false);
        // Only count once per pair: count only bottom chimney (y > center)
        if (o.y > H/2) {
          this.score += 1;
          this.scoreText.setText(String(this.score));
        }
      }
      if (o.x < -120) o.destroy();
    });

    this.cookies.children.each((c) => {
      if (c.active && c.x < -120) c.destroy();
    });
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.spawnTimer.paused = true;
    this.player.setTint(0xff4d4d);
    this.player.setVelocity(0, 0);

    const panel = this.add.rectangle(W/2, H/2, 360, 220, 0x000000, 0.55).setStrokeStyle(2, 0xffffff, 0.35);
    const txt = this.add.text(W/2, H/2 - 20, `GAME OVER\nScore: ${this.score}\n\nClick to retry`, {
      fontFamily: "monospace",
      fontSize: "26px",
      color: "#ffffff",
      align: "center"
    }).setOrigin(0.5);

    this.input.once("pointerdown", () => this.scene.restart());
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
  backgroundColor: "#0b1b2b",
  physics: { default: "arcade" },
  scene: [PlayScene]
});
