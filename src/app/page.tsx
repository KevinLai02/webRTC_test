"use client";
import { useEffect, useState } from "react";
import * as io from 'socket.io-client';
import { values } from 'lodash';

const socket = io.connect("http://localhost:8080/");

// ice server's configuration
const configuration = {
  iceServers: [
      {
          urls: 'stun:stun.l.google.com:19302',
      }, {
          urls: 'stun:stun.xten.com',
      }],
};

const signalOption = {
  offerToReceiveAudio: 1, // 是否傳送聲音流給對方
  offerToReceiveVideo: 1, // 是否傳送影像流給對方
};

export default function Home() {
  const [localSteam, setLocalStream] = useState<MediaStream>()
  const [remote, setRemote] = useState<MediaStream>()
    const [pcPeers, setPcPeers] = useState<RTCPeerConnection>()
    const join = async () => {
        createPC()
        socket.emit('join', "testRoom");
    };
    const createPC = async () => {
      const peer = new RTCPeerConnection(configuration);
      setPcPeers(peer)
      peer.onicecandidate = ({ candidate }) => {
          console.log('candidate=>');
          if (candidate) {
              socket.emit('exchange', { candidate });
          }
      };
      peer.ontrack = ({ streams }) => {
        console.log('here is ontrack', streams);
        
        setRemote(streams[0])
    };
    };
    const createSignal = async(isOffer: boolean)=> {  
      try {
        console.log('pcPeers=>',pcPeers);
        
        if (!pcPeers) {
          console.log('尚未開啟視訊');
          return;
        }
        // 呼叫 peerConnect 內的 createOffer / createAnswer
        let offer = await pcPeers[`create${isOffer ? 'Offer' : 'Answer'}`]();
    
        // 設定本地流配置
        await pcPeers.setLocalDescription(offer);
        sendSignalingMessage(pcPeers.localDescription, isOffer ? true : false)
      } catch(err) {
        console.log(err);
      }
    };
    
    function sendSignalingMessage(desc: RTCSessionDescription | null, offer: boolean) {
      const isOffer = offer ? "offer" : "answer";
      console.log(`寄出 ${isOffer}`);
      socket.emit("peerconnectSignaling", { desc });
    };

    useEffect(() => {
        (async () => {
            const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            setLocalStream(localStream)
        })()
        socket.on('exchange', async ({ desc, candidate }) => {
          console.log('candidate');
          
          if (desc && !pcPeers!.currentRemoteDescription) {
            console.log('desc => ', desc);
            
            await pcPeers!.setRemoteDescription(new RTCSessionDescription(desc));
            createSignal(desc.type === 'answer' ? true : false);
          } else if (candidate) {
            // 新增對方 IP 候選位置
            console.log('candidate =>', candidate);
            pcPeers!.addIceCandidate(new RTCIceCandidate(candidate));
          }
        });
    }, [])
    console.log(remote);
    
  return (
    <div>
      <div>
        <button onClick={() => {
            join()
        }}>Join
        </button>
      </div>
      <video 
        ref={video => {
          if (video && localSteam) {
            video.srcObject = localSteam;
          }
        }}
        controls
        autoPlay
        muted
      />
      {remote && (
        <video
          ref={video => {
            if (video) {
              video.srcObject = remote;
            }
          }}
          autoPlay
          playsInline
          muted={true}
        />
        )
      }
    </div>
  );
}
