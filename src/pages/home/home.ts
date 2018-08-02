import { Component, NgZone } from '@angular/core';
import { LoadingController, Loading } from 'ionic-angular';
import { File, FileEntry, IFile } from '@ionic-native/file';
import { HTTP, HTTPResponse } from '@ionic-native/http';
import { FileTransfer, FileTransferObject } from '@ionic-native/file-transfer';

import { AudioAssistantProvider } from '../../providers/audio-assistant/audio-assistant';
import { WatsonCredential } from '../../model/watson-credentials';
import { ConversionOutput } from '../../model/conversion-output';

@Component({
  selector: 'page-home',
  templateUrl: 'home.html'
})
export class HomePage {

  private recognizedText: string;
  private textToBeSynthesized: string;

  private watsonSpeechToTextCredential: WatsonCredential;
  private watsonTextToSpeechCredential: WatsonCredential;

  private cloudconvertApiKey: string;

  private mediaDirectory: string;

  private fileTransferObject: FileTransferObject;
  private loading: Loading;

  constructor(
    private audioAssistant: AudioAssistantProvider,
    private file: File,
    private fileTransfer: FileTransfer,
    private http: HTTP,
    private ngZone: NgZone,
    private loadingCtrl: LoadingController
  ) {
    this.watsonSpeechToTextCredential = {
      url: 'https://stream.watsonplatform.net/speech-to-text/api',
      username: '************************************',
      password: '************'
    };
    this.watsonTextToSpeechCredential = {
      url: 'https://stream.watsonplatform.net/text-to-speech/api',
      username: '************************************',
      password: '************'
    };

    this.cloudconvertApiKey = '****************************************************************';

    this.mediaDirectory = this.file.externalCacheDirectory;

    this.fileTransferObject = this.fileTransfer.create();
  }

  toogleRecord(): void {
    if (this.audioAssistant.recording) {
      let audioRecordFileName: string = this.audioAssistant.stopRecording();

      this.presentLoadingDefault();

      this.file.readAsDataURL(this.file.externalCacheDirectory, audioRecordFileName)
        .then((audioRecordBase64DataUrl: string) =>
          this.http.post(
            'https://api.cloudconvert.com/convert',
            {
              apikey: this.cloudconvertApiKey,
              inputformat: '3gp',
              outputformat: 'flac',
              input: 'base64',
              convertoptions: { audio_codec: 'FLAC', audio_bitrate: '256', audio_channels: '1', audio_frequency: '48000' },
              file: audioRecordBase64DataUrl,
              filename: audioRecordFileName,
              wait: 'true',
              download: 'false'
            },
            {}
          ).then((convertAudioRecordHttpResponse: HTTPResponse) => {
            let audioRecordConversionOutput: ConversionOutput = JSON.parse(convertAudioRecordHttpResponse.data).output;

            this.fileTransferObject.download(
              'http:' + audioRecordConversionOutput.url,
              this.file.externalCacheDirectory + audioRecordConversionOutput.filename
            ).then((audioRecordConvertedFileEntry: FileEntry) =>
              audioRecordConvertedFileEntry.file((audioRecordConvertedFile: IFile) => {
                let fileReader: FileReader = new FileReader();

                fileReader.onloadend = () =>
                  this.getWatsonAuthorizationToken(this.watsonSpeechToTextCredential)
                    .then((getWatsonAuthorizationTokenHttpResponse: HTTPResponse) => {
                      let speechToTextRecognizeWebsocket: WebSocket = new WebSocket(
                        this.watsonSpeechToTextCredential.url.replace(/^https/, 'wss') + '/v1/recognize?' +
                        'watson-token=' + getWatsonAuthorizationTokenHttpResponse.data + '&' +
                        'model=pt-BR_BroadbandModel'
                      );

                      speechToTextRecognizeWebsocket.onopen = () => {
                        speechToTextRecognizeWebsocket.onmessage = (messageEvent: MessageEvent) => {
                          let speechToTextRecognizeMessage: any = JSON.parse(messageEvent.data);

                          if (speechToTextRecognizeMessage.hasOwnProperty('results')) {
                            this.ngZone.run(_ =>
                              this.recognizedText = (<SpeechToTextRecognizeResult>speechToTextRecognizeMessage.results[0])
                                .alternatives[0].transcript
                            );

                            speechToTextRecognizeWebsocket.close();

                            this.loading.dismiss();
                          }
                        };

                        speechToTextRecognizeWebsocket.send(JSON.stringify(
                          { 'action': 'start', 'content-type': 'audio/flac' }
                        ));
                        speechToTextRecognizeWebsocket.send(new Blob(
                          [new Uint8Array(fileReader.result)],
                          { type: 'audio/flac' }
                        ));
                        speechToTextRecognizeWebsocket.send(JSON.stringify(
                          { 'action': 'stop' }
                        ));
                      };
                    });

                fileReader.readAsArrayBuffer(audioRecordConvertedFile);
              })
            );
          })
        );
    } else {
      this.audioAssistant.startRecording(this.mediaDirectory);
    }
  }

  play(): void {
    this.presentLoadingDefault();

    this.getWatsonAuthorizationToken(this.watsonTextToSpeechCredential)
      .then((getWatsonAuthorizationTokenHttpResponse: HTTPResponse) => {
        let textToSpeechSynthesizeWebsocket: WebSocket = new WebSocket(
          this.watsonTextToSpeechCredential.url.replace(/^https/, 'wss') + '/v1/synthesize?' +
          'watson-token=' + getWatsonAuthorizationTokenHttpResponse.data + '&' +
          'voice=pt-BR_IsabelaVoice'
        );

        textToSpeechSynthesizeWebsocket.onopen = () => {
          let speechAudioStream: Blob;

          textToSpeechSynthesizeWebsocket.onmessage = (messageEvent: MessageEvent) => {
            let textToSpeechSynthesizeMessage: any = messageEvent.data;

            if (textToSpeechSynthesizeMessage instanceof Blob) {
              speechAudioStream = new Blob(
                speechAudioStream ?
                  [speechAudioStream, textToSpeechSynthesizeMessage] :
                  [textToSpeechSynthesizeMessage]
              );
            }
          };

          textToSpeechSynthesizeWebsocket.onclose = () => {
            this.file.writeFile(this.mediaDirectory, 'synthesized.ogg', speechAudioStream, { replace: true })
              .then((teste: FileEntry) =>
                this.audioAssistant.play(this.mediaDirectory, teste.name)
              );

            this.loading.dismiss();
          };

          textToSpeechSynthesizeWebsocket.send(JSON.stringify(
            { text: this.textToBeSynthesized, accept: '*/*' }
          ));
        };
      });
  }

  private presentLoadingDefault() {
    this.loading = this.loadingCtrl.create({ content: 'Aguarde...' });
    this.loading.present();
  }

  private getWatsonAuthorizationToken(watsonCredential: WatsonCredential): Promise<HTTPResponse> {
    return this.http.get(
      'https://stream.watsonplatform.net/authorization/api/v1/token',
      { url: watsonCredential.url },
      { Authorization: 'Basic ' + btoa(`${watsonCredential.username}:${watsonCredential.password}`) }
    );
  }
}
