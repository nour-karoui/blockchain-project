import DStorage from '../abis/DStorage.json';
import React, { Component } from 'react';
import Navbar from './Navbar';
import Main from './Main';
import Web3 from 'web3';
import EthCrypto from 'eth-crypto';
import axios from 'axios';
import { encrypt, decrypt } from 'eciesjs';
import './App.css';

const toBuffer = require('blob-to-buffer');
const ipfsClient = require('ipfs-http-client')
const ipfs = ipfsClient({ host: 'ipfs.infura.io', port: 5001, protocol: 'https' }) // leaving out the arguments will default to these values

class App extends Component {

  async componentWillMount() {
    await this.loadWeb3()
    await this.loadBlockchainData()
  }

  async loadWeb3() {
    if (window.ethereum) {
      window.web3 = new Web3(window.ethereum)
      await window.ethereum.enable()
    }
    else if (window.web3) {
      window.web3 = new Web3(window.web3.currentProvider)
    }
    else {
      window.alert('Non-Ethereum browser detected. You should consider trying MetaMask!')
    }
  }

  async loadBlockchainData() {
    const web3 = window.web3
    // Load account
    const privateKey = 'c92d351bfdb880a5b7dd05f5f7a0398a6932ebd261b230e3ad28fe4dbd7d4573'
    const account = web3.eth.accounts.privateKeyToAccount(privateKey)
    const publicKey = EthCrypto.publicKeyByPrivateKey(localStorage.getItem('privateKey'))
    this.setState({ account: account.address })
    this.setState({ publicKey })
    localStorage.setItem('privateKey', privateKey)
    // Network ID
    const networkId = await web3.eth.net.getId()
    const networkData = DStorage.networks[networkId]
    if(networkData) {
      // Assign contract
      const dstorage = new web3.eth.Contract(DStorage.abi, networkData.address)
      this.setState({ dstorage })
      // Get files amount
      const filesCount = await dstorage.methods.fileCount().call()
      this.setState({ filesCount })
      // Load files&sort by the newest
      for (var i = filesCount; i >= 1; i--) {
        const file = await dstorage.methods.files(i).call()
        this.setState({
          files: [...this.state.files, file]
        })
      }
    } else {
      window.alert('DStorage contract not deployed to detected network.')
    }
  }

  // Get file from user
  captureFile = event => {
    event.preventDefault()

    const file = event.target.files[0]
    const reader = new window.FileReader()

    reader.readAsArrayBuffer(file)
    reader.onloadend = () => {
      this.setState({
        buffer: Buffer(reader.result),
        type: file.type,
        name: file.name
      })
      console.log('buffer', this.state.buffer)
    }
  }

  uploadFile = description => {
    console.log("Submitting file to IPFS...")
    const encrypted = encrypt(this.state.publicKey, this.state.buffer)
    // Add file to the IPFS
    ipfs.add(encrypted, (error, result) => {
      console.log('IPFS result', result.size)
      if(error) {
        console.error(error)
        return
      }

      this.setState({ loading: true })
      // Assign value for the file without extension
      if(this.state.type === ''){
        this.setState({type: 'none'})
      }
      this.state.dstorage.methods.uploadFile(result[0].hash, result[0].size, this.state.type, this.state.name, description).send({ from: this.state.account }).on('transactionHash', (hash) => {
        this.setState({
         loading: false,
         type: null,
         name: null
       })
       window.location.reload()
      }).on('error', (e) =>{
        window.alert('Error')
        this.setState({loading: false})
      })
    })
  }

  // Decrypt and download file
  downloadFile(url) {
    axios({
      url: url,
      method: "GET",
      responseType: "blob" // important
    }).then(async response => {
      const blob1 = new Blob([response.data])
      toBuffer(blob1, function (err, buffer) {
        if (err) throw err
        const dec = decrypt('0x' + localStorage.getItem('privateKey'), buffer)
        let blob = new Blob([dec], { type: 'application/pdf' });
        let url = URL.createObjectURL(blob);
        window.open(url);
      })
    });
  }

  constructor(props) {
    super(props)
    this.state = {
      account: '',
      dstorage: null,
      files: [],
      loading: false,
      type: null,
      name: null
    }
    this.uploadFile = this.uploadFile.bind(this)
    this.captureFile = this.captureFile.bind(this)
  }

  render() {
    return (
      <div>
        <Navbar account={this.state.account} />
        { this.state.loading
          ? <div id="loader" className="text-center mt-5"><p>Loading...</p></div>
          : <Main
              files={this.state.files}
              captureFile={this.captureFile}
              uploadFile={this.uploadFile}
              downloadFile={this.downloadFile}
            />
        }
      </div>
    );
  }
}

export default App;
