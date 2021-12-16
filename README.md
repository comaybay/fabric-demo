## Khởi tạo mạng lưới ngang hàng:

`cd network`

tắt network nếu đang mở:

`./network.sh down`

chạy:

`./network.sh up createChannel -c mychannel -ca`

Network chứa 2 node thành viên (Org1, Org2) đại diện cho hai tổ chức khác nhau, có nhiệm vụ xác nhận giao dịch và tạo giao dịch. Network còn có một Orderer là node có công việc đồng thuận về thứ tự của các giao dịch trong mạng lưới và đặt các giao dịch vào block.

Tiếp theo, ta triển khai chaincode (ở đây chaincode này được viết bằng ngôn ngữ javascript):

`./network.sh deployCC -ccn basic -ccp ../chaincode/ -ccl javascript`

(Quá trình này tốn một khoảng thời gian dài)

## Chạy server:
Xây dựng ứng dụng tương tác với chaincode đã được triển khai:

Đi tới thư mục của ứng dụng:

`cd ../server`

Cài các dependencies:

`npm install `

Quá trình cài này có thể tốn một khoảng thời gian dài. npm install sẽ cài đặt các chương trình quan trọng dùng cho việc kết nối đến kênh trong mạng lưới, gửi giao dịch và đợi thông báo.

Chạy ứng dụng:

`node app.js`

Ứng dụng đầu tiên sẽ tạo một dịch vụ Fabric CA (Certificate Authority) dùng để tạo và xác nhận chứng chỉ số (dùng cho việc xác định danh tính của các thành viên trong mạng lưới).

Sao đó ứng dụng sẽ tạo một cái ví dùng để chứa các credential của người dùng.

Tiếp theo, ứng dụng kết nạp admin và lưu credentials vào ví.

Việc kết nạp một người dùng sẽ tạo ra public key, private key và giấy chứng thực. Sau khi tạo xong, public key sau đó sẽ được gửi lên Fabric CA và sau Fabric CA sẽ gửi lại giấy chứng thực được mã hóa cho người dùng. Những thứ này (gọi là credentials) sau đó sẽ được lưu vào ví của người dùng.

Tiếp theo, ứng dụng sử dụng admin để đăng ký và kết nạp người dùng mới vào ví. Ở đây có id là ‘appUser’.

Giờ ta đã có hai người dùng là admin và appUser trong ứng dụng.

## Sử dụng các chức năng:

Xem file server/instructions.txt để biết cách tương tác với server
