// HO-HO-HONK FINAL (fire gate included)
const W=480,H=800;

class Play extends Phaser.Scene{
  constructor(){super("play");this.started=false;this.dead=false;}
  preload(){
    this.load.image("bg","./assets/bg.png");
    this.load.image("player","./assets/player.png");
    this.load.image("chimney","./assets/chimney.png");
    this.load.image("chimney_fire","./assets/chimney_fire.png");
    this.load.image("flame","./assets/flame.png");
    this.load.image("fire_glow","./assets/fire_glow.png");
  }
  create(){
    this.add.tileSprite(W/2,H/2,W,H,"bg");
    this.player=this.physics.add.sprite(140,H/2,"player");
    this.player.body.allowGravity=false;

    this.obstacles=this.physics.add.group();
    this.fireGates=this.physics.add.group();

    this.input.on("pointerdown",()=>this.start());
    this.input.keyboard.on("keydown-SPACE",()=>this.start());

    this.spawn=this.time.addEvent({delay:1400,loop:true,paused:true,callback:()=>this.spawnPair()});

    this.physics.add.overlap(this.player,this.obstacles,()=>this.die());
    this.physics.add.overlap(this.player,this.fireGates,()=>this.die());
  }
  start(){
    if(this.started)return;
    this.started=true;
    this.player.body.allowGravity=true;
    this.player.setVelocityY(-200);
    this.spawn.paused=false;
  }
  spawnPair(){
    const gap=150;
    const cy=Phaser.Math.Between(220,H-220);
    const top=this.obstacles.create(W+60,cy-gap/2-300,"chimney_fire");
    const bot=this.obstacles.create(W+60,cy+gap/2+300,"chimney_fire");
    [top,bot].forEach(o=>{o.body.allowGravity=false;o.setVelocityX(-260);});

    const flame=this.add.image(W+60,cy,"flame").setAlpha(0);
    const glow=this.add.image(W+60,cy,"fire_glow").setAlpha(0);
    const zone=this.add.zone(W+60,cy,70,gap);
    this.physics.add.existing(zone);
    zone.body.allowGravity=false;
    zone.body.enable=false;
    zone.body.setVelocityX(-260);
    this.fireGates.add(zone);

    const pulse=()=>{
      if(this.dead)return;
      zone.body.enable=true;
      flame.setAlpha(1);glow.setAlpha(.7);
      this.time.delayedCall(220,()=>{
        zone.body.enable=false;
        flame.setAlpha(0);glow.setAlpha(0);
        this.time.delayedCall(600+Math.random()*600,pulse);
      });
    };
    this.time.delayedCall(400,pulse);
  }
  die(){
    if(this.dead)return;
    this.dead=true;
    this.scene.restart();
  }
}

new Phaser.Game({
  type:Phaser.AUTO,
  width:W,height:H,
  physics:{default:"arcade"},
  scene:[Play],
  backgroundColor:"#081426"
});
