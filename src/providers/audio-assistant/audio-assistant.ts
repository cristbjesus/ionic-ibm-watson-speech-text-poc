import { Injectable } from '@angular/core';
import { Media, MediaObject } from '@ionic-native/media';

/*
  Generated class for the AudioAssistantProvider provider.

  See https://angular.io/guide/dependency-injection for more info on providers
  and Angular DI.
*/
@Injectable()
export class AudioAssistantProvider {

  private currentAudioRecordFileName: string;
  private currentAudioRecordMediaObject: MediaObject;

  public recording: boolean;

  constructor(private media: Media) {
    this.recording = false;
  }

  startRecording(mediaDirectory: string): void {
    this.currentAudioRecordFileName = `record${new Date().getTime()}.3gp`;

    this.currentAudioRecordMediaObject = this.media.create(mediaDirectory + this.currentAudioRecordFileName);

    this.currentAudioRecordMediaObject.startRecord();
    this.recording = true;
  }

  stopRecording(): string {
    let audioRecordFileName: string = this.currentAudioRecordFileName;

    this.currentAudioRecordMediaObject.stopRecord();
    this.currentAudioRecordMediaObject = null;
    this.currentAudioRecordFileName = null;
    this.recording = false;

    return audioRecordFileName;
  }

  play(mediaDirectory: string, audioFileName: string): void {
    this.media.create(mediaDirectory + audioFileName).play();
  }
}
