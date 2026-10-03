---
title: The TCP three-way handshake
subtitle: Why three steps, not two
---
> Before TCP sends data, each side must know the other can send and receive.

## Both sides wait
```sequence
Client -> Server: SYN
Server -> Client: SYN-ACK
Client -> Server: ACK
note Client, Server: ESTABLISHED
```
> The client sends a SYN to ask for a connection.
> The [Server] answers with a SYN-ACK.
> The client replies with an ACK.
> Now both sides are in the ESTABLISHED state.

## What each step proves
```flow LR
Client -> Server: 1st: client can send
Server -> Client: 2nd: server can send and receive
Client -> *Both confirmed: 3rd: client can receive
```
> After the first step, the server knows the client can send.
> After the second step, the client knows the server works both ways.
> Only the third step proves that the [client can receive].

## What if there were only two steps
| Case | Two steps | Three steps |
|---|---|---|
| An old SYN arrives late | no Server opens a dead connection | ok Client sends no ACK |
| Wasted resources | no Idle connections | ok None |
| Both directions checked | warn Only half | ok Fully |
> Suppose an old SYN arrives late.
> With two steps, the server opens a connection that nobody uses.
> With three steps, the client sends no ACK, so no connection opens.
