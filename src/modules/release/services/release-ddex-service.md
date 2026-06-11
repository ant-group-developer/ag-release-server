# ERN 4.3 XML Schema Reading Guide

Tai lieu nay tap trung vao cach doc schema DDEX ERN 4.3 va cach viet mot file XML hop le.

Nguon schema:

- ERN 4.3 XSD: `https://service.ddex.net/xml/ern/43/release-notification.xsd`
- AVS values XSD: `https://service.ddex.net/xml/allowed-value-sets/allowed-value-sets.xsd`

## Hai File Schema Hoat Dong Voi Nhau Nhu Nao

`release-notification.xsd` dinh nghia cau truc XML:

- Ten cac the: `NewReleaseMessage`, `MessageHeader`, `ResourceList`, `ReleaseList`, `DealList`, ...
- Thu tu cac the.
- The nao bat buoc, the nao optional.
- The nao duoc lap lai nhieu lan.
- Kieu du lieu: string, dateTime, duration, boolean, ID, IDREF.
- Reference pattern: `A...`, `R...`, `P...`, `T...`, `V...`.

`allowed-value-sets.xsd` dinh nghia gia tri hop le cho cac truong co enum:

- `ReleaseType`: `Album`, `Single`, `VideoSingle`, ...
- `ImageType`: `FrontCoverImage`, `VideoScreenCapture`, ...
- `TextType`: `Caption`, `SubTitle`, ...
- `ParentalWarningType`: `Explicit`, `NotExplicit`, ...
- `LinkDescription`: `VideoScreenCapture`, `Caption`, ...

Trong ERN XSD co import AVS:

```xml
<xs:import
    namespace="http://ddex.net/xml/allowed-value-sets"
    schemaLocation="http://ddex.net/xml/allowed-value-sets/allowed-value-sets.xsd"/>
```

Nghia la:

- ERN XSD noi "the nay co type la `avs:ImageType`".
- AVS XSD noi "`avs:ImageType` duoc phep co nhung value nao".

## Cach Doc XSD

### 1. Tim Root Element

Trong `release-notification.xsd`, bat dau tu:

```xml
<xs:element name="NewReleaseMessage">
```

Ben trong co:

```xml
<xs:complexType>
    <xs:sequence>
        ...
    </xs:sequence>
</xs:complexType>
```

`xs:sequence` nghia la XML phai viet dung thu tu.

Vi du neu schema ghi:

```xml
<xs:sequence>
    <xs:element name="MessageHeader" type="ern:MessageHeader"/>
    <xs:element name="PartyList" type="ern:PartyList"/>
    <xs:element name="ResourceList" type="ern:ResourceList"/>
    <xs:element name="ReleaseList" type="ern:ReleaseList"/>
    <xs:element name="DealList" minOccurs="0" type="ern:DealList"/>
</xs:sequence>
```

Thi XML hop le phai theo thu tu:

```xml
<MessageHeader>...</MessageHeader>
<PartyList>...</PartyList>
<ResourceList>...</ResourceList>
<ReleaseList>...</ReleaseList>
<DealList>...</DealList>
```

Khong duoc dua `ReleaseList` len truoc `ResourceList`.

### 2. Hieu `minOccurs` Va `maxOccurs`

Mac dinh neu khong ghi gi:

```xml
<xs:element name="ReleaseList" type="ern:ReleaseList"/>
```

Nghia la bat buoc co dung 1 lan.

Neu co:

```xml
<xs:element name="DealList" minOccurs="0" type="ern:DealList"/>
```

Nghia la optional, co hoac khong deu duoc.

Neu co:

```xml
<xs:element name="TrackRelease" minOccurs="0" maxOccurs="unbounded"/>
```

Nghia la co the khong co, hoac co nhieu lan.

### 3. Hieu `type`

Vi du:

```xml
<xs:element name="ResourceList" type="ern:ResourceList"/>
```

Muon biet `ResourceList` ben trong gom nhung gi, tim:

```xml
<xs:complexType name="ResourceList">
```

Trong do co sequence:

```xml
<xs:sequence>
    <xs:element name="SoundRecording" minOccurs="0" maxOccurs="unbounded"/>
    <xs:element name="Video" minOccurs="0" maxOccurs="unbounded"/>
    <xs:element name="Image" minOccurs="0" maxOccurs="unbounded"/>
    <xs:element name="Text" minOccurs="0" maxOccurs="unbounded"/>
</xs:sequence>
```

Vay trong XML, `ResourceList` phai theo thu tu:

```text
SoundRecording*
Video*
Image*
Text*
```

Neu viet `Text` truoc `Image` thi fail schema.

### 4. Hieu `xs:choice`

`xs:choice` nghia la chi chon 1 trong cac the con.

Vi du schema co dang:

```xml
<xs:choice minOccurs="0">
    <xs:element name="NoDisplaySequence" type="xs:boolean"/>
    <xs:element name="DisplaySequence" type="xs:string"/>
</xs:choice>
```

Nghia la:

- Co the khong ghi cai nao.
- Neu ghi thi chi ghi 1 trong 2: `NoDisplaySequence` hoac `DisplaySequence`.
- Khong ghi ca 2 cung luc.

### 5. Hieu `xs:ID` Va `xs:IDREF`

`xs:ID` la noi khai bao reference.

Vi du trong resource:

```xml
<ResourceReference>A1</ResourceReference>
```

Neu schema cua `ResourceReference` la `xs:ID`, thi `A1` la ID duoc khai bao.

`xs:IDREF` la noi tro toi ID da ton tai.

Vi du:

```xml
<ReleaseResourceReference>A1</ReleaseResourceReference>
```

Neu schema cua `ReleaseResourceReference` la `xs:IDREF`, thi `A1` phai ton tai truoc do trong `ResourceList`.

## Quy Uoc Reference Trong ERN

ERN dung local anchor theo chu cai dau:

| Prefix | Y nghia | Vi du |
| --- | --- | --- |
| `A` | Resource reference | `A1`, `A2`, `A3` |
| `R` | Release reference | `R0`, `R1` |
| `P` | Party reference | `P1`, `P2` |
| `T` | Technical details reference | `T1V`, `T2`, `T3S` |
| `V` | Visibility reference | `V0`, `V1` |

Vi du resource khai bao:

```xml
<Video>
    <ResourceReference>A1</ResourceReference>
    ...
</Video>
```

Release group tro toi resource:

```xml
<ResourceGroupContentItem>
    <ReleaseResourceReference>A1</ReleaseResourceReference>
</ResourceGroupContentItem>
```

Neu `A1` khong ton tai trong `ResourceList`, validate se fail.

## Cach Doc AVS Values

Neu trong ERN XSD thay:

```xml
<xs:element name="Type" type="ern:ImageType"/>
```

Tim tiep trong ERN XSD:

```xml
<xs:complexType name="ImageType">
    <xs:simpleContent>
        <xs:extension base="avs:ImageType">
```

Nghia la value that su nam trong AVS XSD o:

```xml
<xs:simpleType name="ImageType">
```

Ben trong se co cac value:

```xml
<xs:enumeration value="FrontCoverImage"/>
<xs:enumeration value="VideoScreenCapture"/>
<xs:enumeration value="Logo"/>
...
```

Vay XML hop le:

```xml
<Type>VideoScreenCapture</Type>
```

XML sai:

```xml
<Type>Thumbnail</Type>
```

Tru khi type do cho phep `UserDefined` va ban viet dung attribute `UserDefinedValue`.

## Demo Mot So AVS Values

### Release Type

Field:

```xml
<ReleaseType>VideoSingle</ReleaseType>
```

Mot so value hop le:

```text
Album
Single
EP
VideoSingle
VideoAlbum
Bundle
UserDefined
```

### Image Type

Field:

```xml
<Image>
    <Type>VideoScreenCapture</Type>
</Image>
```

Mot so value hop le:

```text
FrontCoverImage
BackCoverImage
VideoScreenCapture
Logo
Poster
ProfilePicture
UserDefined
```

### Text Type

Field:

```xml
<Text>
    <Type>Caption</Type>
</Text>
```

Mot so value hop le:

```text
Caption
ClosedCaption
SubTitle
LyricText
TextDocument
UserDefined
```

### Link Description

Field:

```xml
<LinkedReleaseResourceReference LinkDescription="VideoScreenCapture">A2</LinkedReleaseResourceReference>
```

Mot so value hop le:

```text
CoverArt
VideoScreenCapture
Caption
SubTitle
Lyrics
Booklet
UserDefined
```

### Parental Warning

Field:

```xml
<ParentalWarningType>NotExplicit</ParentalWarningType>
```

Value hop le:

```text
Explicit
ExplicitContentEdited
NoAdviceAvailable
NotExplicit
Unknown
UserDefined
```

## Skeleton Mot File ERN 4.3 Hop Le

Day la khung toi thieu ve mat thu tu, khong phai day du business metadata:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ern:NewReleaseMessage
    xmlns:ern="http://ddex.net/xml/ern/43"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://ddex.net/xml/ern/43 http://ddex.net/xml/ern/43/release-notification.xsd"
    ReleaseProfileVersionId="Video"
    LanguageAndScriptCode="en"
    AvsVersionId="3">

    <MessageHeader>...</MessageHeader>
    <PartyList>...</PartyList>
    <ResourceList>...</ResourceList>
    <ReleaseList>...</ReleaseList>
    <DealList>...</DealList>
</ern:NewReleaseMessage>
```

## Demo Video Single Co Thumbnail Va Caption

Trong vi du nay:

- `A1` la video.
- `A2` la thumbnail/screen capture.
- `A3` la caption file.
- `R0` la main release.
- `R1` la track release cho video.
- `T1V`, `T2`, `T3S` la technical details refs.

### ResourceList

Phai theo thu tu `Video -> Image -> Text`:

```xml
<ResourceList>
    <Video>
        <ResourceReference>A1</ResourceReference>
        <Type>ShortFormMusicalWorkVideo</Type>
        <VideoEdition>
            <Type>NonImmersiveEdition</Type>
            <ResourceId>
                <ISRC>USXXX2600001</ISRC>
            </ResourceId>
            <TechnicalDetails>
                <TechnicalResourceDetailsReference>T1V</TechnicalResourceDetailsReference>
                <DeliveryFile>
                    <Type>AudioVisualFile</Type>
                    <File>
                        <URI>resources/USXXX2600001_T1V.mp4</URI>
                    </File>
                    <IsProvidedInDelivery>true</IsProvidedInDelivery>
                </DeliveryFile>
            </TechnicalDetails>
        </VideoEdition>
        <DisplayTitleText>Video title</DisplayTitleText>
        <DisplayTitle ApplicableTerritoryCode="Worldwide" IsDefault="true">
            <TitleText>Video title</TitleText>
        </DisplayTitle>
        <DisplayArtistName ApplicableTerritoryCode="Worldwide" IsDefault="true">Artist Name</DisplayArtistName>
        <DisplayArtist SequenceNumber="1">
            <ArtistPartyReference>P1</ArtistPartyReference>
            <DisplayArtistRole>MainArtist</DisplayArtistRole>
        </DisplayArtist>
        <Duration>PT0H5M0S</Duration>
        <ParentalWarningType>NotExplicit</ParentalWarningType>
    </Video>

    <Image>
        <ResourceReference>A2</ResourceReference>
        <Type>VideoScreenCapture</Type>
        <ResourceId>
            <ProprietaryId Namespace="PADPIDA000000000">front-cover-image:123456789012</ProprietaryId>
        </ResourceId>
        <TechnicalDetails>
            <TechnicalResourceDetailsReference>T2</TechnicalResourceDetailsReference>
            <File>
                <URI>resources/123456789012.jpg</URI>
            </File>
        </TechnicalDetails>
    </Image>

    <Text>
        <ResourceReference>A3</ResourceReference>
        <Type>Caption</Type>
        <TechnicalDetails>
            <TechnicalResourceDetailsReference>T3S</TechnicalResourceDetailsReference>
            <TextCodecType>SRT</TextCodecType>
            <File>
                <URI>resources/USXXX2600001_T1S.srt</URI>
            </File>
        </TechnicalDetails>
        <LanguageOfText>en</LanguageOfText>
    </Text>
</ResourceList>
```

### ReleaseList ResourceGroup

`ResourceGroup` noi resource nao la primary va resource nao linked voi no:

```xml
<ReleaseList>
    <Release>
        <ReleaseReference>R0</ReleaseReference>
        <ReleaseType>VideoSingle</ReleaseType>
        <ReleaseId>
            <ICPN>123456789012</ICPN>
        </ReleaseId>

        <!-- title, artist, label, genre, warning... -->

        <ResourceGroup>
            <SequenceNumber>1</SequenceNumber>
            <ResourceGroupContentItem>
                <SequenceNumber>1</SequenceNumber>
                <ReleaseResourceReference>A1</ReleaseResourceReference>
                <LinkedReleaseResourceReference LinkDescription="VideoScreenCapture">A2</LinkedReleaseResourceReference>
                <LinkedReleaseResourceReference LinkDescription="Caption">A3</LinkedReleaseResourceReference>
            </ResourceGroupContentItem>
        </ResourceGroup>
    </Release>

    <TrackRelease>
        <ReleaseReference>R1</ReleaseReference>
        <ReleaseResourceReference>A1</ReleaseResourceReference>
        ...
    </TrackRelease>
</ReleaseList>
```

## Nhung Loi Hay Gap

### Sai Thu Tu Trong `ResourceList`

Sai:

```xml
<ResourceList>
    <Video>...</Video>
    <Text>...</Text>
    <Image>...</Image>
</ResourceList>
```

Dung:

```xml
<ResourceList>
    <Video>...</Video>
    <Image>...</Image>
    <Text>...</Text>
</ResourceList>
```

### Sai Vi Tri TechnicalResourceDetailsReference

Sai:

```xml
<Text>
    <ResourceReference>A3</ResourceReference>
    <Type>Caption</Type>
    <TechnicalDetails>
        <TextCodecType>SRT</TextCodecType>
    </TechnicalDetails>
    <TechnicalResourceDetailsReference>T3S</TechnicalResourceDetailsReference>
</Text>
```

Dung:

```xml
<Text>
    <ResourceReference>A3</ResourceReference>
    <Type>Caption</Type>
    <TechnicalDetails>
        <TechnicalResourceDetailsReference>T3S</TechnicalResourceDetailsReference>
        <TextCodecType>SRT</TextCodecType>
    </TechnicalDetails>
</Text>
```

### Reference Khong Ton Tai

Sai:

```xml
<LinkedReleaseResourceReference LinkDescription="VideoScreenCapture">A9</LinkedReleaseResourceReference>
```

Neu khong co resource nao khai bao:

```xml
<ResourceReference>A9</ResourceReference>
```

thi validate fail.

### Value Khong Nam Trong AVS

Sai:

```xml
<Type>Thumbnail</Type>
```

Dung:

```xml
<Type>VideoScreenCapture</Type>
```

## Checklist Khi Viet XML

- Doc root `NewReleaseMessage` de biet block top-level va thu tu.
- Voi moi `type="ern:..."`, tim `complexType name="..."` de doc con cua no.
- Voi moi `type="avs:..."`, tim trong AVS XSD de lay allowed values.
- Ton trong `xs:sequence`: thu tu la bat buoc.
- Ton trong `minOccurs` / `maxOccurs`.
- Kiem tra moi `IDREF` co `ID` tuong ung.
- Kiem tra moi enum value nam trong AVS.
- Kiem tra date/duration dung format:
  - `xs:dateTime`: `2026-06-03T00:00:00Z`
  - `xs:duration`: `PT0H5M0S`
